import { scaleLog } from 'd3-scale';
import { extent } from 'd3-array';
import { select, pointer } from 'd3-selection';
import { drag } from 'd3-drag';
import { axisBottom } from 'd3-axis';
import { timer } from 'd3-timer';
import { easeCubicInOut } from 'd3-ease';
import { createChart, MARGIN } from './base-chart.js';
import { makeFmt, fmtMult, tickCountForWidth } from '../utils/format.js';
import { detectScaleType } from '../scale/detect.js';
import { scaleAdaptive } from '../scale/adaptive-scale.js';

export function createAdaptiveChart(points, {
  x = d => d.x,         // accessor for the adaptively-scaled (skewed) variable
  width = 900, height = 260,
  windowFraction = 0.5, // slider tightness [0,1]; named to avoid shadowing globalThis.window
  breakpointMethod = 'quantile', // 'quantile' | 'iqr' | 'log-iqr' | 'percentile' — see scaleAdaptive
  xFormat = '~s',
  mode,
  xLo: xLoOverride,    // explicit boundary from drag handles; undefined = use windowQuantile
  xHi: xHiOverride,
  qLo: qLoOverride,    // explicit pixel fraction [0,1] for r1; undefined = use slider
  qHi: qHiOverride,    // explicit pixel fraction [0,1] for r2; undefined = use slider
  focusXLo,            // uncapped focus window from the travel gesture (undefined = none)
  focusXHi,
  onWindowDrag,        // callback({ xLo, xHi }) fired on every drag move (lightweight)
  onWindowChange,      // callback({ xLo, xHi, qLo?, qHi? }) fired on dragend (triggers re-render)
  onTravel,            // callback({ xLo, xHi }) fired when a click/arrow travel completes
  ...options
} = {}) {
  if (!points?.length) {
    // A sized, classed placeholder — an unsized bare <svg> renders as an invisible
    // 300×150 default box in an Observable cell bound to an empty data input.
    const empty = select(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
      .attr('class', 'chart')
      .attr('viewBox', [0, 0, width, height])
      .style('width', '100%')
      .style('height', '100%');
    empty.append('text')
      .attr('x', width / 2).attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', 'currentColor').attr('fill-opacity', 0.4)
      .attr('font-size', '11px')
      .text('no data');
    return empty.node();
  }

  const resolvedMode = mode ?? detectScaleType(points.map(x));

  return resolvedMode === 'log'
    ? renderLog(points, { x, width, height, xFormat, ...options })
    : renderPiecewise(points, {
        x, width, height, windowFraction, breakpointMethod, xFormat,
        xLoOverride, xHiOverride, qLoOverride, qHiOverride, focusXLo, focusXHi,
        onWindowDrag, onWindowChange, onTravel,
        ...options,
      });
}

// ── Log mode ──────────────────────────────────────────────────────────────────

function renderLog(points, { x, width, height, xFormat, ...options }) {
  const marginLeft = options.marginLeft ?? MARGIN.left;
  const marginRight = options.marginRight ?? MARGIN.right;
  const [xMin, xMax] = extent(points, x);
  const innerW = width - marginLeft - marginRight;
  const xScale = scaleLog().domain([xMin, xMax]).range([0, innerW]).nice();
  return createChart(points, xScale, { x, width, height, xFormat, ...options });
}

// ── Piecewise mode ────────────────────────────────────────────────────────────

// Unique per-instance prefix for hatch clipPath ids — Observable renders many cells at
// once; a shared id would silently clip the wrong chart.
let _hatchInstId = 0;

function renderPiecewise(points, {
  x, width, height, windowFraction, breakpointMethod, xFormat,
  xLoOverride, xHiOverride, qLoOverride, qHiOverride, focusXLo, focusXHi,
  onWindowDrag, onWindowChange, onTravel,
  minWindowPx = 20,     // minimum pixel width the linear region can be dragged down to
  showHint = true,      // the fading "click a section · ←/→ to travel" badge on first render
  tailTexture = 'ruler', // 'ruler' (chunk posts + per-chunk arrows) | 'hatch' (the diagonal-hatch
                         // density encoding from the development process — kept as an option so
                         // the article can embed the historical experiment on the current engine)
  tailTintBase = 0.02,  // fill opacity of the first (innermost) tail chunk
  tailTintStep = 0.012, // opacity added per chunk outward
  tailTintMax = 0.10,   // tint ceiling
  rulerMinPx = 2,       // tail chunk narrower than this stops the ruler (density cap)
  hatchSpacing = 8,     // hatch mode: px between lines in the widest (boundary-nearest) band
  hatchMinPx = 2,       // hatch mode: spacing below this → solid fill to the extreme
  hatchOpacity = 0.45,  // hatch mode: stroke opacity of the diagonal lines
  hatchFillOpacity = 0.5, // hatch mode: opacity of the solid fill past max compression
  hatchAngle = 1,       // hatch mode: 1 = "\" diagonals, -1 = "/" diagonals
  ...options
}) {
  const marginLeft = options.marginLeft ?? MARGIN.left;
  const marginRight = options.marginRight ?? MARGIN.right;
  const marginTop = options.marginTop ?? MARGIN.top;
  const marginBottom = options.marginBottom ?? MARGIN.bottom;
  const innerW = width  - marginLeft - marginRight;
  const innerH = height - marginTop  - marginBottom;
  const [xMin, xMax] = extent(points, x);
  const xValues = points.map(x);
  const eps = (xMax - xMin) * 1e-9;

  const xScale = scaleAdaptive()
    .domain([xMin, xMax])
    .range([0, innerW])
    .data(xValues)
    .window(windowFraction)
    .breakpointMethod(breakpointMethod);

  if (xLoOverride != null && xHiOverride != null) {
    xScale.linearDomain([xLoOverride, xHiOverride]);
  }
  if (qLoOverride != null && qHiOverride != null) {
    xScale.linearRange([innerW * qLoOverride, innerW * qHiOverride]);
  }
  // An active travel ("focus") window is placed uncapped — exactly on a section's data.
  if (focusXLo != null && focusXHi != null) {
    xScale.focusDomain([focusXLo, focusXHi]);
  }

  const [xLo, xHi] = xScale.linearDomain();
  const [r1, r2] = xScale.linearRange();
  const r0 = 0;
  const r3 = innerW;

  let { leftScale, midScale, rightScale } = xScale.subscales();

  // Mutable window state the scale reads, so a drag can update the scale (and the axis)
  // in place. leftScale/midScale/rightScale are reassigned on drag too (see applyState).
  let currentXLo = xLo, currentXHi = xHi, currentR1 = r1, currentR2 = r2;
  // When true, interaction places the window uncapped via focusDomain (the travel gesture);
  // when false, the capped linearDomain path (pan/drag/auto). True if we loaded into a focus.
  let useFocus = (focusXLo != null && focusXHi != null);


  // Held for redrawing the x-axis live on drag. Colour comes from CHART_CSS (.tick/.domain).
  const xFmt = makeFmt(xFormat);

  const node = createChart(points, xScale, { x, width, height, xFormat, ...options });
  const g = select(node).select('g');

  // Overlay on linear region — lowered below dots so dots still get pointer
  // events for tooltips. Drag is attached here so clicks on empty space in the
  // linear region trigger the pan while clicks on dots reach the dot handlers.
  const overlay = g.append('rect')
      .attr('class', 'pan-overlay')
      .attr('x', r1).attr('width', Math.max(0, r2 - r1))
      .attr('y', 0).attr('height', innerH)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')
      .attr('tabindex', '0')
      .attr('role', 'slider')
      .attr('aria-label', 'Chart viewport — ←/→ travel between sections, Shift+←/→ to pan, double-click to reset')
      .style('outline', 'none')
    .lower();

  // Pan hint — a single badge that rides along centred in the linear window. It announces the
  // gesture on render, then fades after a few seconds. The ←/→ convey that the window slides
  // through the data; "scan the data" implies the whole range is reachable (push to an edge and
  // the window docks and keeps scrolling). It follows the window via positionPanHint() in
  // applyState, so it never gets left behind when you drag.
  const HINT_TEXT = 'click a section · ←/→ to travel · double-click resets';
  const hintFontSize = 10, hintPadY = 4, hintPadX = 9;
  const hintH = hintFontSize + hintPadY * 2;
  const hintW = HINT_TEXT.length * 5.5 + hintPadX * 2;
  const hintCy = innerH - hintH / 2 - 4;

  const panHintG = showHint
    ? g.append('g').attr('pointer-events', 'none').style('opacity', 0.9)
    : select(null);
  if (showHint) {
    panHintG.append('rect')
      .attr('class', 'pan-hint-bg')
      .attr('x', -hintW / 2).attr('y', -hintH / 2)
      .attr('width', hintW).attr('height', hintH).attr('rx', hintH / 2)
      .attr('fill-opacity', 0.12)
      .attr('stroke-opacity', 0.3).attr('stroke-width', 1);
    panHintG.append('text')
      .attr('class', 'pan-hint-text')
      .attr('y', hintFontSize * 0.35)
      .attr('text-anchor', 'middle')
      .attr('fill-opacity', 0.65)
      .attr('font-size', `${hintFontSize}px`)
      .text(HINT_TEXT);
  }

  // Re-centre the badge in the current window; a no-op once faded/removed or with showHint off
  // (select(null) is an empty selection, so the attr call touches nothing).
  const positionPanHint = () =>
    panHintG.attr('transform', `translate(${(currentR1 + currentR2) / 2},${hintCy})`);
  positionPanHint();

  if (showHint) {
    panHintG.style('transition', 'opacity 0.8s');
    setTimeout(() => {
      panHintG.style('opacity', 0);
      setTimeout(() => panHintG.remove(), 800);
    }, 3000);
  }

  // ── Region annotations ────────────────────────────────────────────────────
  // Permanent dimension-line annotations: one per scale region, always visible.
  // Shows the type label ("power" / "linear") above and the data range below.
  const ANNOT_Y   = 24;   // y of the dimension line
  const ANNOT_ARR = 5;    // arrowhead length in px

  function makeAnnotation(typeLabel) {
    const grp = g.append('g').attr('pointer-events', 'none');

    grp.append('text')
      .attr('class', 'annot-type').attr('y', 8).attr('text-anchor', 'middle')
      .attr('fill-opacity', 0.3)
      .attr('font-size', '9px').attr('font-style', 'italic')
      .text(typeLabel);

    // .annot-value carries its text-halo (paint-order + stroke = --chart-surface) from CHART_CSS.
    const valueTxt = grp.append('text')
      .attr('class', 'annot-value').attr('y', ANNOT_Y - 2).attr('text-anchor', 'middle')
      .attr('fill-opacity', 0.65)
      .attr('font-size', '10px').attr('font-weight', '500');

    const dimLine = grp.append('line')
      .attr('class', 'annot-line')
      .attr('y1', ANNOT_Y).attr('y2', ANNOT_Y)
      .attr('stroke-opacity', 0.45).attr('stroke-width', 1);
    const arrL = grp.append('polygon').attr('class', 'annot-arrow').attr('fill-opacity', 0.45);
    const arrR = grp.append('polygon').attr('class', 'annot-arrow').attr('fill-opacity', 0.45);

    return function update(p1, p2, lo, hi) {
      if (p2 - p1 < 2 * ANNOT_ARR + 28) { grp.style('display', 'none'); return; }
      grp.style('display', null);
      const cx = (p1 + p2) / 2;
      grp.select('.annot-type').attr('x', cx);
      valueTxt.attr('x', cx).text(xFmt(hi - lo));
      dimLine.attr('x1', p1 + ANNOT_ARR).attr('x2', p2 - ANNOT_ARR);
      arrL.attr('points', `${p1},${ANNOT_Y} ${p1+ANNOT_ARR},${ANNOT_Y-3} ${p1+ANNOT_ARR},${ANNOT_Y+3}`);
      arrR.attr('points', `${p2},${ANNOT_Y} ${p2-ANNOT_ARR},${ANNOT_Y-3} ${p2-ANNOT_ARR},${ANNOT_Y+3}`);
    };
  }

  const updateLinearAnnot = makeAnnotation('linear');

  // Tint ramp for the tail chunks — exposed as tailTintBase/Step/Max options.
  const TINT_BASE = tailTintBase;
  const TINT_STEP = tailTintStep;
  const TINT_MAX  = tailTintMax;

  // Tail rulers replace the hatch. The linear window's dollar width W is tiled across
  // each log tail: every chunk spans the SAME W dollars, so the symlog renders them at
  // shrinking widths toward the extreme. Each chunk boundary gets a full-height post —
  // the same vertical line the linear section has at its edge — and a chunk wide enough
  // also gets a ←→ dimension arrow up top. As compression grows the arrows drop out but
  // the posts remain and bunch. Because the symlog compresses monotonically, once a chunk
  // is narrower than RULER_MIN_PX every later one is too, so we stop there — capping the
  // posts at ~(tail width / RULER_MIN_PX), never thousands. Redrawn on every change.
  const leftRulerG  = g.append('g').attr('pointer-events', 'none');
  const rightRulerG = g.append('g').attr('pointer-events', 'none');

  // Raise dots above all decoration groups (axes, rulers, annotations) so they
  // paint on top and receive pointer events without the ruler rects dimming them.
  g.selectAll('circle').raise();

  const RULER_HEAD   = 2.4;                // ~20% smaller heads → a couple more arrows fit
  const ARROW_MIN_PX = 2 * RULER_HEAD + 9; // ~14px: room for a ←→ arrow
  const TEXT_MIN_PX  = 20;                 // room for a stacked "log" / "×1" label
  const RULER_MIN_PX = rulerMinPx;         // chunk narrower than this → stop (density cap); option
  function drawTailRuler(grp, sub, boundary, extreme, W) {
    if (!(W > 0) || boundary === extreme) {
      grp.selectAll('*').remove();
      return;
    }
    const outward = Math.sign(extreme - boundary) || 1;
    const hy = 3;

    const rects = [];
    const posts = [];
    const arrows = [];
    const texts = [];

    let collapseAt = null, lastDrawnK = -1;
    for (let k = 0; k < 4000; k++) {
      const d0 = boundary + outward * k * W;
      let d1 = boundary + outward * (k + 1) * W;
      const beyond = outward > 0 ? d1 >= extreme : d1 <= extreme;
      if (beyond) d1 = extreme;
      const a = Math.min(sub(d0), sub(d1)), b = Math.max(sub(d0), sub(d1));
      const w = b - a;
      if (w < RULER_MIN_PX) break;

      const bgOpacity = Math.min(TINT_BASE + k * TINT_STEP, TINT_MAX);
      rects.push({ id: `bg-${k}`, x: a, w: w, opacity: bgOpacity });

      const postX = outward > 0 ? b : a;
      posts.push({ id: `post-${k}`, x: postX, opacity: 0.14 });

      if (w >= ARROW_MIN_PX) {
        arrows.push({ id: `arrow-${k}`, x1: a, x2: b, opacity: 0.45 });
        if (w >= TEXT_MIN_PX) {
          // A tail narrower than one window-width can't be "×N window-widths" — show its
          // dollar span instead of a misleading ×0.x.
          const mult = beyond ? Math.abs(extreme - d0) / W : 1;
          const val = mult >= 1 ? `×${fmtMult(mult)}` : xFmt(Math.abs(extreme - d0));
          texts.push({ id: `lbl-t-${k}`, x: (a + b) / 2, y: 8, text: 'log', opacity: 0.3, italic: true, size: 9 });
          texts.push({ id: `lbl-v-${k}`, x: (a + b) / 2, y: ANNOT_Y - 2, text: val, opacity: 0.65, size: 10, weight: '500' });
        }
      } else if (collapseAt === null) {
        collapseAt = d0;
      }
      lastDrawnK = k;
      if (beyond) break;
    }

    if (collapseAt !== null) {
      const a = Math.min(sub(collapseAt), sub(extreme)), b = Math.max(sub(collapseAt), sub(extreme));
      const n = Math.abs(extreme - collapseAt) / W;
      if (n >= 1 && b - a > 1) {
        const subEdge = boundary + outward * (lastDrawnK + 1) * W;
        const sa = Math.min(sub(subEdge), sub(extreme)), sb = Math.max(sub(subEdge), sub(extreme));
        if (sb > sa) {
          const bgOpacity = Math.min(TINT_BASE + Math.max(0, lastDrawnK) * TINT_STEP, TINT_MAX);
          rects.push({ id: 'collapse-bg', x: sa, w: sb - sa, opacity: bgOpacity });

          const denseStart = outward > 0 ? sa + RULER_MIN_PX : sa;
          const denseEnd   = outward > 0 ? sb : sb - RULER_MIN_PX;
          for (let px = denseStart; px <= denseEnd; px += RULER_MIN_PX) {
            posts.push({ id: `dense-post-${px}`, x: px, opacity: 0.14 });
          }
        }
        arrows.push({ id: 'collapse-arrow', x1: a, x2: b, opacity: 0.65 });
        texts.push({ id: 'collapse-lbl-t', x: (a + b) / 2, y: 8, text: 'log', opacity: 0.3, italic: true, size: 9 });
        texts.push({ id: 'collapse-lbl-v', x: (a + b) / 2, y: ANNOT_Y - 2, text: n >= 1 ? `×${fmtMult(n)}` : xFmt(Math.abs(extreme - collapseAt)), opacity: 0.65, size: 10, weight: '500' });
      }
    }

    // Close the tail with a post at the extreme edge — the same vertical line the chart's start
    // edge gets. The chunk/dense loops step by RULER_MIN_PX and, under compression, stop a pixel
    // or two short of the extreme on the outward (right) tail, so pin the boundary explicitly to
    // keep both ends of the chart symmetric.
    posts.push({ id: 'edge', x: sub(extreme), opacity: 0.14 });

    // 1. Background Rectangles
    grp.selectAll('rect.ruler-bg')
      .data(rects, d => d.id)
      .join('rect')
        .attr('class', 'ruler-bg')
        .attr('x', d => d.x)
        .attr('width', d => d.w)
        .attr('y', 0)
        .attr('height', innerH)
        .attr('fill-opacity', d => d.opacity)
        .attr('pointer-events', 'none');

    // 2. Vertical Posts
    grp.selectAll('line.ruler-post')
      .data(posts, d => d.id)
      .join('line')
        .attr('class', 'ruler-post')
        .attr('x1', d => d.x)
        .attr('x2', d => d.x)
        .attr('y1', 0)
        .attr('y2', innerH)
        .attr('stroke-opacity', d => d.opacity)
        .attr('stroke-width', 1);

    // 3. Arrow Lines and Heads
    const arrowLines = grp.selectAll('g.ruler-arrow')
      .data(arrows, d => d.id)
      .join(
        enter => {
          const g = enter.append('g').attr('class', 'ruler-arrow');
          g.append('line');
          g.append('polygon').attr('class', 'arr-head-l');
          g.append('polygon').attr('class', 'arr-head-r');
          return g;
        }
      )
      .style('opacity', d => d.opacity);

    arrowLines.select('line')
      .attr('x1', d => d.x1 + RULER_HEAD)
      .attr('x2', d => d.x2 - RULER_HEAD)
      .attr('y1', ANNOT_Y)
      .attr('y2', ANNOT_Y)
      .attr('stroke-width', 1);

    arrowLines.select('.arr-head-l')
      .attr('points', d => `${d.x1},${ANNOT_Y} ${d.x1 + RULER_HEAD},${ANNOT_Y - hy} ${d.x1 + RULER_HEAD},${ANNOT_Y + hy}`);

    arrowLines.select('.arr-head-r')
      .attr('points', d => `${d.x2},${ANNOT_Y} ${d.x2 - RULER_HEAD},${ANNOT_Y - hy} ${d.x2 - RULER_HEAD},${ANNOT_Y + hy}`);

    // 4. Texts
    grp.selectAll('text.ruler-lbl')
      .data(texts, d => d.id)
      .join('text')
        .attr('class', 'ruler-lbl')
        .attr('x', d => d.x)
        .attr('y', d => d.y)
        .attr('text-anchor', 'middle')
        .attr('fill-opacity', d => d.opacity)
        .attr('font-size', d => `${d.size}px`)
        .attr('font-style', d => d.italic ? 'italic' : null)
        .attr('font-weight', d => d.weight ?? null)
        .text(d => d.text);
  }

  // ── Hatch texture (the development-process encoding, kept as an option) ─────
  // Each tail is tiled into the same window-width chunks the ruler uses, but rendered as
  // 45° diagonal <line> elements whose spacing encodes compression: the boundary-nearest
  // (widest) band gets hatchSpacing px between lines, narrower bands get proportionally
  // denser lines, and once spacing falls below hatchMinPx the rest of the tail is a solid
  // fill. Lines are explicit primitives inside a per-band clipPath — never SVG <pattern>,
  // which Chrome clips at tile boundaries even with overflow:visible, leaving anti-aliased
  // dots at every seam. One dimension annotation spans the whole tail (the historical look),
  // instead of the ruler's per-chunk arrows.
  const hatchInstId = `hatch-${++_hatchInstId}`;
  const svgDefs = select(node).select('defs');

  function drawTailHatch(grp, sub, boundary, extreme, W) {
    grp.selectAll('*').remove();
    const side = extreme < boundary ? 'l' : 'r';
    svgDefs.selectAll(`[id^="${hatchInstId}-${side}"]`).remove();
    if (!(W > 0) || boundary === extreme) return;
    const outward = Math.sign(extreme - boundary) || 1;

    // Whole-tail dimension annotation: log + dollar span, same classes as the ruler labels.
    const tA = Math.min(sub(boundary), sub(extreme)), tB = Math.max(sub(boundary), sub(extreme));
    if (tB - tA >= 2 * ANNOT_ARR + 28) {
      const cx = (tA + tB) / 2;
      grp.append('text').attr('class', 'ruler-lbl')
        .attr('x', cx).attr('y', 8).attr('text-anchor', 'middle')
        .attr('fill-opacity', 0.3).attr('font-size', '9px').attr('font-style', 'italic')
        .text('log');
      grp.append('text').attr('class', 'annot-value')
        .attr('x', cx).attr('y', ANNOT_Y - 2).attr('text-anchor', 'middle')
        .attr('fill-opacity', 0.65).attr('font-size', '10px').attr('font-weight', '500')
        .text(xFmt(Math.abs(extreme - boundary)));
      grp.append('line').attr('class', 'annot-line')
        .attr('x1', tA + ANNOT_ARR).attr('x2', tB - ANNOT_ARR)
        .attr('y1', ANNOT_Y).attr('y2', ANNOT_Y)
        .attr('stroke-opacity', 0.45).attr('stroke-width', 1);
      grp.append('polygon').attr('class', 'annot-arrow').attr('fill-opacity', 0.45)
        .attr('points', `${tA},${ANNOT_Y} ${tA + ANNOT_ARR},${ANNOT_Y - 3} ${tA + ANNOT_ARR},${ANNOT_Y + 3}`);
      grp.append('polygon').attr('class', 'annot-arrow').attr('fill-opacity', 0.45)
        .attr('points', `${tB},${ANNOT_Y} ${tB - ANNOT_ARR},${ANNOT_Y - 3} ${tB - ANNOT_ARR},${ANNOT_Y + 3}`);
    }

    // Continuous marching lines — NOT per-band lattices. Discrete bands each carried their
    // own line phase, so diagonals got cut at every band seam and the next band's lines
    // didn't continue them (visible stagger, worst where bands were near-equal width).
    // Instead, spacing follows the scale's LOCAL compression rate at each anchor: density
    // varies smoothly, every line runs full height unbroken, and there are no seams at all.
    const boundaryPx = sub(boundary);
    const extremePx  = sub(extreme);
    const dir = Math.sign(extremePx - boundaryPx) || 1; // pixel direction outward

    // Local pixels-per-dollar at value v (numeric derivative, evaluated outward).
    const dv = Math.abs(extreme - boundary) * 1e-6;
    const rateAt = v => Math.abs(sub(v + outward * dv) - sub(v)) / dv;
    const r0 = rateAt(boundary) || 1; // ≈ windowSlope by construction (C¹ joint)

    // Whole-tail clip so lines entering from outside the tail still cover its corners.
    // (Shrunk later if a solid-fill region is drawn, so no line slants into the fill —
    // the hatch→solid transition stays a clean vertical edge.)
    const clipId = `${hatchInstId}-${side}`;
    const clipRect = svgDefs.append('clipPath').attr('id', clipId)
      .append('rect').attr('x', tA).attr('width', Math.max(0, tB - tA)).attr('y', 0).attr('height', innerH);
    const linesG = grp.append('g').attr('clip-path', `url(#${clipId})`);

    // March anchors, where an anchor c is the line's x at MID-HEIGHT (y = innerH/2), not the
    // top edge. Two reasons:
    //  - Coverage is provably complete for either hatchAngle: a point (x, y) is only crossed
    //    by lines whose mid-height x lies within innerH/2 of x, and the march overshoots each
    //    tail edge by exactly innerH/2 — so no wedge of missing texture can appear (the "/"
    //    direction previously lost a diagonal wedge near the solid fill).
    //  - The density gradient reads at chart centre instead of sheared by a full chart height
    //    (top-edge anchors made spacing at eye level reflect the compression rate innerH away).
    const clampPx = px => Math.max(Math.min(boundaryPx, extremePx), Math.min(Math.max(boundaryPx, extremePx), px));
    const spacingAt = c => Math.max(0.5, hatchSpacing * (rateAt(sub.invert(clampPx(c))) / r0));

    let c = (dir > 0 ? tA : tB) - dir * innerH / 2;
    const endC = (dir > 0 ? tB : tA) + dir * innerH / 2;
    const maxLines = Math.ceil(Math.abs(endC - c) / 0.5) + 4;
    let fillEdge = null;
    for (let i = 0; i < maxLines; i++) {
      if (dir > 0 ? c > endC : c < endC) break;
      let spacing = spacingAt(c);

      // Density has hit the floor inside the tail — solid fill from here to the extreme and
      // trim the line clip so the hatch→solid transition is a clean vertical edge.
      const inTail = dir > 0 ? c >= tA : c <= tB;
      if (fillEdge === null && spacing < hatchMinPx && inTail) {
        fillEdge = c;
        const fillA = dir > 0 ? Math.max(tA, c) : tA;
        const fillB = dir > 0 ? tB : Math.min(tB, c);
        if (fillB - fillA > 0.5) {
          grp.append('rect').attr('class', 'hatch-fill')
            .attr('x', fillA).attr('width', fillB - fillA)
            .attr('y', 0).attr('height', innerH)
            .attr('fill-opacity', hatchFillOpacity);
          if (dir > 0) clipRect.attr('width', Math.max(0, fillA - tA));
          else clipRect.attr('x', fillB).attr('width', Math.max(0, tB - fillB));
        }
      }
      if (fillEdge !== null) {
        // Keep marching half a height past the fill edge (at the floor spacing) so slanted
        // lines anchored beyond it still cover the hatch strip's corners next to the fill —
        // stopping dead at the edge is what cut the "/" texture along a diagonal.
        spacing = Math.max(spacing, hatchMinPx);
        if (dir > 0 ? c > fillEdge + innerH / 2 : c < fillEdge - innerH / 2) break;
      }

      linesG.append('line').attr('class', 'hatch-line')
        .attr('x1', c - hatchAngle * innerH / 2).attr('y1', 0)
        .attr('x2', c + hatchAngle * innerH / 2).attr('y2', innerH)
        .attr('stroke-opacity', hatchOpacity).attr('stroke-width', 1);
      c += dir * spacing;
    }
  }

  const drawTail = tailTexture === 'hatch' ? drawTailHatch : drawTailRuler;

  updateLinearAnnot(r1, r2, xLo, xHi);
  drawTail(leftRulerG,  leftScale,  xLo, xMin, xHi - xLo);
  drawTail(rightRulerG, rightScale, xHi, xMax, xHi - xLo);

  // Report the window the scale actually settled on (after capping) so the page readout
  // reflects what's rendered, not the raw slider quantiles.
  onWindowDrag?.({ xLo, xHi });

  // ── Drag handles ─────────────────────────────────────────────────────────────
  if (onWindowChange) {
    const circles = g.selectAll('circle');

    function applyState(newXLo, newXHi, newR1, newR2) {
      if (useFocus) xScale.focusDomain([newXLo, newXHi]);
      else          xScale.linearDomain([newXLo, newXHi]);
      xScale.linearRange([newR1, newR2]);
      const sub = xScale.subscales();
      leftScale = sub.leftScale;
      midScale = sub.midScale;
      rightScale = sub.rightScale;
      // Read the window BACK from the scale: it may have capped the domain (never swallow the
      // outliers) or reserved tail pixels. The chart renders whatever the scale decided.
      [currentXLo, currentXHi] = xScale.linearDomain();
      [currentR1,  currentR2 ] = xScale.linearRange();
      circles.attr('cx', d => xScale(d.x));
      overlay.attr('x', currentR1).attr('width', Math.max(0, currentR2 - currentR1));
      leftHandle?.attr('transform',  `translate(${currentR1},0)`);
      rightHandle?.attr('transform', `translate(${currentR2},0)`);
      positionPanHint();  // the hint badge rides along, centred in the window
      // Live x-axis redraw — colour is inherited from CHART_CSS, so just rebind the axis.
      g.select('.x-axis').call(axisBottom(xScale).ticks(tickCountForWidth(innerW)).tickFormat(xFmt));
      updateLinearAnnot(currentR1, currentR2, currentXLo, currentXHi);
      drawTail(leftRulerG,  leftScale,  currentXLo, xMin, currentXHi - currentXLo);
      drawTail(rightRulerG, rightScale, currentXHi, xMax, currentXHi - currentXLo);
      rebuildTailOverlays();
      onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi });
    }

    // ── Travel overlays on the log tails ───────────────────────────────────────
    // Each tail is tiled into linear-window-wide chunks (the same chunks drawTailRuler draws). A
    // transparent rect per tail catches the pointer; hovering highlights the chunk under the cursor
    // and clicking travels the focus onto JUST that chunk's range. Sits above the rulers (the wash
    // shows) but below the dots (tooltips still fire). Click does NOT stopPropagation, so a
    // double-click still bubbles to the container's reset — a 250ms timer the dblclick cancels keeps
    // that double-click from also firing a travel.
    const tailG = g.append('g').attr('class', 'tail-overlays');
    // The highlight that tracks the hovered chunk (pointer-events off so the catcher still gets clicks).
    const chunkHL = tailG.append('rect').attr('class', 'tail-hover-chunk')
      .attr('y', 0).attr('height', innerH)
      .attr('fill', 'var(--ruler-tint)').attr('fill-opacity', 0)
      .attr('pointer-events', 'none');
    let travelClickTimer = null;
    function scheduleTravel(lo, hi) {
      if (travelClickTimer) clearTimeout(travelClickTimer);
      travelClickTimer = setTimeout(() => { travelClickTimer = null; travelTo(lo, hi); }, 250);
    }
    function cancelScheduledTravel() {
      if (travelClickTimer) { clearTimeout(travelClickTimer); travelClickTimer = null; }
    }

    // The window-width chunk [lo,hi] of a tail under pixel px — W = linear-window width in DOLLARS,
    // tiled outward from the linear edge (matching drawTailRuler's chunks). null if degenerate.
    function chunkAt(side, px) {
      const W = currentXHi - currentXLo;
      if (!(W > 0)) return null;
      const v = xScale.invert(px);
      if (side === 'right') {
        const k = Math.max(0, Math.floor((v - currentXHi) / W));
        return [currentXHi + k * W, Math.min(currentXHi + (k + 1) * W, xMax)];
      }
      const k = Math.max(0, Math.floor((currentXLo - v) / W));
      return [Math.max(currentXLo - (k + 1) * W, xMin), currentXLo - k * W];
    }

    // The next window-width chunk in `dir` (>0 right, <0 left) that actually contains data — skips
    // empty chunks so arrow-stepping lands on the next populated section instead of stalling on a gap.
    // Returns null when there's no more data that way (the end of the range).
    function nextChunkWithData(dir) {
      const W = currentXHi - currentXLo;
      if (!(W > 0)) return null;
      if (dir > 0) {
        let next = Infinity;
        for (const x of xValues) if (x > currentXHi + eps && x < next) next = x;
        if (!isFinite(next)) return null;
        const k = Math.max(0, Math.floor((next - currentXHi) / W));
        return [currentXHi + k * W, Math.min(currentXHi + (k + 1) * W, xMax)];
      }
      let prev = -Infinity;
      for (const x of xValues) if (x < currentXLo - eps && x > prev) prev = x;
      if (!isFinite(prev)) return null;
      const k = Math.max(0, Math.floor((currentXLo - prev) / W));
      return [Math.max(currentXLo - (k + 1) * W, xMin), currentXLo - k * W];
    }

    // True if any data point falls inside the chunk [lo, hi]. Empty chunks aren't travel targets
    // (travelTo no-ops them, nextChunkWithData skips them), so they get no hover feedback either.
    const chunkHasData = ([lo, hi]) => xValues.some((x) => x >= lo - eps && x <= hi + eps);

    // Position the hover highlight over a chunk and report whether it's a live target. A null or
    // empty chunk hides the highlight and returns false (so the caller drops the pointer cursor too).
    function showChunkHL(chunk) {
      if (!chunk || !chunkHasData(chunk)) { chunkHL.attr('fill-opacity', 0); return false; }
      const a = xScale(chunk[0]), b = xScale(chunk[1]);
      chunkHL.attr('x', Math.min(a, b)).attr('width', Math.max(1, Math.abs(b - a))).attr('fill-opacity', 0.08);
      return true;
    }
    const hideChunkHL = () => chunkHL.attr('fill-opacity', 0);

    function rebuildTailOverlays() {
      const tails = [];
      if (currentXLo > xMin + eps) tails.push({ side: 'left',  x0: r0,        x1: currentR1 });
      if (currentXHi < xMax - eps) tails.push({ side: 'right', x0: currentR2, x1: r3 });
      tailG.selectAll('rect.tail-overlay')
        .data(tails, d => d.side)
        .join(
          // Transparent pointer-catcher per tail; the visible feedback is chunkHL, positioned on move.
          enter => enter.append('rect')
            .attr('class', d => `tail-overlay tail-${d.side}`)
            .attr('y', 0).attr('height', innerH)
            .attr('fill', 'transparent')
            .attr('pointer-events', 'all')
            .style('cursor', 'pointer')
            .on('pointermove', (event, d) => {
              const chunk = chunkAt(d.side, pointer(event, g.node())[0]);
              event.currentTarget.style.cursor = showChunkHL(chunk) ? 'pointer' : 'default';
            })
            .on('pointerleave', hideChunkHL)
            .on('click', (event, d) => { const c = chunkAt(d.side, pointer(event, g.node())[0]); if (c) scheduleTravel(c[0], c[1]); })
            .on('dblclick', cancelScheduledTravel),
          update => update,
        )
        .attr('x', d => Math.min(d.x0, d.x1))
        .attr('width', d => Math.max(0, Math.abs(d.x1 - d.x0)));
      chunkHL.raise(); // keep the highlight above the (transparent) catchers
    }

    // Travel the focus onto [loBound, hiBound] exactly (a window-width chunk, or a keyboard step):
    // those points fill the linear section, the rest becomes log tails. No-op if the range is empty.
    function travelTo(loBound, hiBound) {
      if (!(hiBound > loBound)) return;
      if (!chunkHasData([loBound, hiBound])) return;
      hideChunkHL();
      // Clicking a tail-overlay rect (not focusable) blurs the pan-overlay, which owns the arrow
      // keys, so after a click-travel the keyboard went dead until you clicked back into the linear
      // section. Hand focus back to the overlay so click-travel stays keyboard-ready. A no-op for
      // arrow-travel, where the overlay already holds focus.
      overlay.node()?.focus({ preventScroll: true });
      // Destination geometry from a fresh focus scale — it picks the tail/focus pixel split.
      const aim = scaleAdaptive().domain([xMin, xMax]).range([0, innerW])
        .data(xValues).window(windowFraction).breakpointMethod(breakpointMethod)
        .focusDomain([loBound, hiBound]);
      const [aimXLo, aimXHi] = aim.linearDomain();
      const [aimR1,  aimR2 ] = aim.linearRange();
      useFocus = true;
      node.animateToWindow(aimXLo, aimXHi, aimR1, aimR2, { focus: true }, null,
        () => onTravel?.({ xLo: aimXLo, xHi: aimXHi }));
    }

    // The boundary in dollars is read straight off the scale's own invert at the handle's
    // pixel — pure math layer, smooth and monotonic. The window can't run away to a flattened
    // view because scaleAdaptive caps it to the non-outlier range; the chart just renders that.
    function applyLeftDrag(px) {
      const newXLo = Math.max(xMin + eps, xScale.invert(px));
      applyState(newXLo, currentXHi, px, currentR2);
      return newXLo;
    }

    function applyRightDrag(px) {
      const newXHi = Math.min(xMax - eps, xScale.invert(px));
      applyState(currentXLo, newXHi, currentR1, px);
      return newXHi;
    }

    function makeHandle(initialPx, side) {
      const label = side === 'left' ? 'Left boundary — arrow keys to move' : 'Right boundary — arrow keys to move';
      const handle = g.append('g')
        .attr('class', `handle handle-${side}`)
        .attr('transform', `translate(${initialPx},0)`)
        .style('cursor', 'col-resize')
        .style('outline', 'none')
        .attr('tabindex', '0')
        .attr('role', 'slider')
        .attr('aria-label', label);

      handle.append('line')
        .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', 'transparent').attr('stroke-width', 8)
        .style('pointer-events', 'stroke');

      handle.append('line')
        .attr('class', 'handle-line')
        .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', innerH)
        .attr('stroke-width', 1).attr('stroke-opacity', 0.3)
        .style('pointer-events', 'none');

      const pillW = 8, pillH = 20;
      const pillY  = innerH / 2 - pillH / 2;
      const pill = handle.append('rect')
        .attr('class', 'handle-pill')
        .attr('x', -pillW / 2).attr('y', pillY)
        .attr('width', pillW).attr('height', pillH)
        .attr('rx', pillW / 2)
        .attr('fill-opacity', 0.22)
        .style('pointer-events', 'none');

      [-2, 2].forEach(cx =>
        [-5, 0, 5].forEach(dy =>
          handle.append('circle')
            .attr('class', 'handle-grip')
            .attr('cx', cx).attr('cy', innerH / 2 + dy)
            .attr('r', 1)
            .attr('fill-opacity', 0.6)
            .style('pointer-events', 'none')
        )
      );

      handle.on('pointerenter focus', () => {
        pill.attr('fill-opacity', 0.55);
        handle.select('.handle-line').attr('stroke-opacity', 0.6);
      });
      handle.on('pointerleave blur', () => {
        pill.attr('fill-opacity', 0.22);
        handle.select('.handle-line').attr('stroke-opacity', 0.3);
      });

      return handle;
    }

    // Declare handles before pan drag so the pan closure can reference them.
    let leftHandle, rightHandle;
    // Set on the first move of any drag; a drag that never moves is a click (see end handlers).
    let dragMoved = false;
    // A window tween (travel or reset) is in flight — gates arrow-repeat travel so holding the key
    // steps one section per animation instead of re-targeting every key-repeat (which drifts).
    let animating = false;

    // Pan: the box translates rigidly in pixel space; the domain follows at a uniform
    // dollar-per-pixel rate. When the pointer pushes past a chart edge the box docks and
    // the window AUTO-SCROLLS through the data on a d3.timer, so it keeps going while the
    // pointer is held — speed scaling with how far past the edge the pointer is. The
    // accumulated scroll is folded into the domain so dragging back is seamless.
    const AUTO_GAIN = 0.12;          // overshoot px → fraction of a pan-step per ~frame
    const AUTO_MAX_OVERSHOOT = 120;  // cap so it can't scroll absurdly fast
    // The window must stay within the scale's cap (capped mode), or the full data extremes when
    // focused (uncapped travel) — otherwise panning past the bound collapses the window.
    const panBounds = () => useFocus ? [xMin, xMax] : xScale.windowBounds();
    let [panLo, panHi] = panBounds();
    let panStartX = 0, panStartR1 = r1, panStartXLo = xLo, panStartXHi = xHi;
    let panBoxW = r2 - r1, panRate = (xHi - xLo) / panBoxW;
    let panPointerX = 0, panAutoAccum = 0, panPrevElapsed = 0, panTimer = null;

    const panOvershoot = () => {              // signed px the desired box sits past an edge
      const desiredR1 = panStartR1 + (panPointerX - panStartX);
      if (desiredR1 > r3 - panBoxW) return Math.min(desiredR1 - (r3 - panBoxW), AUTO_MAX_OVERSHOOT);
      if (desiredR1 < r0)          return Math.max(desiredR1 - r0, -AUTO_MAX_OVERSHOOT);
      return 0;
    };
    function panApply() {
      const delta   = panPointerX - panStartX;
      const newR1   = Math.max(r0, Math.min(r3 - panBoxW, panStartR1 + delta)); // box docks at edge
      const newR2   = newR1 + panBoxW;
      const boundedDelta = newR1 - panStartR1;                                  // pointer pan, capped at the dock
      let newXLo = panStartXLo + boundedDelta * panRate + panAutoAccum;
      let newXHi = panStartXHi + boundedDelta * panRate + panAutoAccum;
      if (newXLo < panLo) { newXHi -= (newXLo - panLo); newXLo = panLo; }
      if (newXHi > panHi) { newXLo -= (newXHi - panHi); newXHi = panHi; }
      applyState(newXLo, newXHi, newR1, newR2);
    }

    overlay.call(drag()
      .on('start', event => {
        dragMoved = false;
        [panLo, panHi] = panBounds();
        panStartX = event.x; panPointerX = event.x;
        panStartR1 = currentR1; panStartXLo = currentXLo; panStartXHi = currentXHi;
        panBoxW = currentR2 - currentR1; panRate = (currentXHi - currentXLo) / panBoxW;
        panAutoAccum = 0; panPrevElapsed = 0;
        overlay.style('cursor', 'grabbing');
        panTimer = timer(elapsed => {
          const dt = Math.min(elapsed - panPrevElapsed, 50); panPrevElapsed = elapsed;
          const over = panOvershoot();
          // Only keep scrolling while there's data left to reveal in that direction.
          const canScroll = over > 0 ? currentXHi < panHi - eps * 2
                          : over < 0 ? currentXLo > panLo + eps * 2 : false;
          if (canScroll) { dragMoved = true; panAutoAccum += over * panRate * AUTO_GAIN * (dt / 16); panApply(); }
        });
      })
      .on('drag', event => { dragMoved = true; panPointerX = event.x; panApply(); })
      .on('end', () => {
        if (panTimer) { panTimer.stop(); panTimer = null; }
        overlay.style('cursor', null);
        // A pure click (no movement) must not re-render: it would replace the SVG between
        // the two clicks of a double-click and swallow the reset gesture.
        if (dragMoved) onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
    );

    leftHandle  = makeHandle(r1, 'left');
    rightHandle = makeHandle(r2, 'right');

    // Dots sit above the handles so a point under a handle line still shows its tooltip on hover.
    // Points are tiny, so the full-height handle hit-line stays grabbable everywhere they aren't.
    g.select('g.dots').raise();

    rebuildTailOverlays(); // initial travel overlays on the present tails

    const kbStep = event => event.shiftKey ? innerW * 0.02 : 5;

    // A keyboard nudge updates the window in place (cheap — same path as a live mouse drag) and
    // defers the heavy commit (state write + chart rebuild that re-settles Spread) until presses
    // stop. Holding an arrow key then rebuilds once on release, not on every key repeat. This
    // mirrors the mouse drag/dragend split. stopPan cancels a pending commit on teardown.
    let kbCommit = null;
    const scheduleCommit = () => {
      if (kbCommit) clearTimeout(kbCommit);
      kbCommit = setTimeout(() => {
        kbCommit = null;
        onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      }, 160);
    };

    leftHandle.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const px = Math.max(r0, Math.min(currentR2 - minWindowPx, currentR1 + dir * kbStep(event)));
      applyLeftDrag(px);
      leftHandle.attr('aria-valuenow', currentXLo);
      onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      scheduleCommit();
    });

    rightHandle.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const px = Math.max(currentR1 + minWindowPx, Math.min(r3, currentR2 + dir * kbStep(event)));
      applyRightDrag(px);
      rightHandle.attr('aria-valuenow', currentXHi);
      onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      scheduleCommit();
    });

    overlay.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;

      // Plain arrow → step one window-width chunk into the adjacent tail (keyboard twin of clicking
      // the chunk nearest the linear window). Ignore auto-repeats while a tween runs, so holding the
      // key advances one section per animation rather than dragging the axis along.
      if (!event.shiftKey) {
        if (animating) return;
        const chunk = nextChunkWithData(dir); // skips empty chunks; null at the end of the data
        if (chunk) travelTo(chunk[0], chunk[1]);
        return;
      }

      // Shift+arrow → fine pan (the original keyboard behaviour). Same cap handling as the mouse
      // pan: clamp to the window bounds and shift as a unit so it parks at the bound with its
      // width intact, instead of drifting past it.
      [panLo, panHi] = panBounds();
      const boxW  = currentR2 - currentR1;
      const step  = kbStep(event);
      const panRate = (currentXHi - currentXLo) / boxW;
      const newR1 = Math.max(r0, Math.min(r3 - boxW, currentR1 + dir * step));
      const newR2 = newR1 + boxW;
      let newXLo = currentXLo + dir * step * panRate;
      let newXHi = currentXHi + dir * step * panRate;
      if (newXLo < panLo) { newXHi -= (newXLo - panLo); newXLo = panLo; }
      if (newXHi > panHi) { newXLo -= (newXHi - panHi); newXHi = panHi; }
      applyState(newXLo, newXHi, newR1, newR2);
      onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      scheduleCommit();
    });

    leftHandle.call(drag()
      .on('drag', event => {
        dragMoved = true;
        const px = Math.max(r0, Math.min(currentR2 - minWindowPx, event.x));
        applyLeftDrag(px);
        onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
      .on('start', () => { dragMoved = false; })
      .on('end', () => {
        if (dragMoved) onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
    );

    rightHandle.call(drag()
      .on('drag', event => {
        dragMoved = true;
        const px = Math.max(currentR1 + minWindowPx, Math.min(r3, event.x));
        applyRightDrag(px);
        onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
      .on('start', () => { dragMoved = false; })
      .on('end', () => {
        if (dragMoved) onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
    );
    node.stopPan = () => {
      if (panTimer) { panTimer.stop(); panTimer = null; }
      if (kbCommit) { clearTimeout(kbCommit); kbCommit = null; }
      cancelScheduledTravel();
    };

    // Window-travel animation. animateToWindow tweens from the current window to an explicit
    // destination; focus:true keeps applyState on the uncapped focusDomain path for the whole
    // tween (the click/arrow travel), focus:false lands on the capped path (reset). A new call
    // cancels any in-flight tween, so a reset interrupts a travel and rapid travels re-target.
    let resetTimer = null;
    node.animateToWindow = (aimXLo, aimXHi, aimR1, aimR2, { focus = false } = {}, onProgress, onDone) => {
      if (resetTimer) { resetTimer.stop(); resetTimer = null; }
      animating = true;
      const fromXLo = currentXLo, fromXHi = currentXHi, fromR1 = currentR1, fromR2 = currentR2;
      const DURATION = 650;
      resetTimer = timer(elapsed => {
        const t = Math.min(1, elapsed / DURATION);
        const e = easeCubicInOut(t);
        // Interpolate uncapped between two known-good endpoints so the cap can't snap an out-of-cap
        // start (a focused window). Settle into the real mode at the end: travel → stay focused
        // (uncapped); reset → capped (the auto destination is in-cap, so its placement is identical).
        useFocus = true;
        applyState(
          fromXLo + (aimXLo - fromXLo) * e,
          fromXHi + (aimXHi - fromXHi) * e,
          fromR1  + (aimR1  - fromR1)  * e,
          fromR2  + (aimR2  - fromR2)  * e,
        );
        onProgress?.(e);
        if (t >= 1) { resetTimer.stop(); resetTimer = null; animating = false; useFocus = focus; onDone?.(); }
      });
    };

    // Reset/double-click: tween back to the auto (capped) window at the target slider value.
    node.animateToAuto = (targetWindow, onProgress, onDone) => {
      const aim = scaleAdaptive()
        .domain([xMin, xMax]).range([0, innerW])
        .data(xValues).window(targetWindow).breakpointMethod(breakpointMethod);
      const [aimXLo, aimXHi] = aim.linearDomain();
      const [aimR1,  aimR2 ] = aim.linearRange();
      node.animateToWindow(aimXLo, aimXHi, aimR1, aimR2, { focus: false }, onProgress, () => {
        useFocus = false;
        onDone?.();
      });
    };
  }

  return node;
}
