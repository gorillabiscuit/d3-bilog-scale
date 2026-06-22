import { scaleLog } from 'd3-scale';
import { extent } from 'd3-array';
import { select } from 'd3-selection';
import { drag } from 'd3-drag';
import { axisBottom } from 'd3-axis';
import { timer } from 'd3-timer';
import { createChart, MARGIN } from './base-chart.js';
import { makeFmt, fmtMult } from '../utils/format.js';
import { detectScaleType } from '../scale/detect.js';
import { windowQuantile } from '../scale/window.js';
import { scaleAdaptive } from '../scale/adaptive-scale.js';

export function createAdaptiveChart(points, {
  width = 900, height = 260,
  window = 0.5,
  xFormat = '~s',
  mode,
  xLo: xLoOverride,    // explicit boundary from drag handles; undefined = use windowQuantile
  xHi: xHiOverride,
  qLo: qLoOverride,    // explicit pixel fraction [0,1] for r1; undefined = use slider
  qHi: qHiOverride,    // explicit pixel fraction [0,1] for r2; undefined = use slider
  onWindowDrag,        // callback({ xLo, xHi }) fired on every drag move (lightweight)
  onWindowChange,      // callback({ xLo, xHi, qLo?, qHi? }) fired on dragend (triggers re-render)
  tailTicks = 6,       // max ruler lines in each tail
  ...options
} = {}) {
  if (!points?.length) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const resolvedMode = mode ?? detectScaleType(points.map(d => d.x));

  return resolvedMode === 'log'
    ? renderLog(points, { width, height, xFormat, ...options })
    : renderPiecewise(points, {
        width, height, window, xFormat,
        xLoOverride, xHiOverride, qLoOverride, qHiOverride, onWindowDrag, onWindowChange,
        tailTicks,
        ...options,
      });
}

// ── Log mode ──────────────────────────────────────────────────────────────────

function renderLog(points, { width, height, xFormat, ...options }) {
  const [xMin, xMax] = extent(points, d => d.x);
  const innerW = width  - MARGIN.left - MARGIN.right;
  const xScale = scaleLog().domain([xMin, xMax]).range([0, innerW]).nice();
  return createChart(points, xScale, { width, height, xFormat, ...options });
}

// ── Piecewise mode ────────────────────────────────────────────────────────────

const MIN_WINDOW_PX = 20; // minimum pixel width of the linear region

function renderPiecewise(points, {
  width, height, window, xFormat,
  xLoOverride, xHiOverride, qLoOverride, qHiOverride, onWindowDrag, onWindowChange,
  tailTicks,
  ...options
}) {
  const innerW = width  - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top  - MARGIN.bottom;
  const [xMin, xMax] = extent(points, d => d.x);
  const xValues = points.map(d => d.x);
  const eps = (xMax - xMin) * 1e-9;

  const xScale = scaleAdaptive()
    .domain([xMin, xMax])
    .range([0, innerW])
    .data(xValues)
    .window(window)
    .breakpointMethod('quantile'); // Use quantile matching chart slider

  if (xLoOverride != null && xHiOverride != null) {
    xScale.linearDomain([xLoOverride, xHiOverride]);
  }
  if (qLoOverride != null && qHiOverride != null) {
    xScale.linearRange([innerW * qLoOverride, innerW * qHiOverride]);
  }

  const [xLo, xHi] = xScale.linearDomain();
  const [r1, r2] = xScale.linearRange();
  const r0 = 0;
  const r3 = innerW;

  let { leftScale, midScale, rightScale } = xScale.subscales();

  // Mutable window state the scale reads, so a drag can update the scale (and the axis)
  // in place. leftScale/midScale/rightScale are reassigned on drag too (see applyState).
  let currentXLo = xLo, currentXHi = xHi, currentR1 = r1, currentR2 = r2;


  // Held for redrawing the x-axis live on drag. Colour comes from CHART_CSS (.tick/.domain).
  const xFmt = makeFmt(xFormat);

  const node = createChart(points, xScale, { width, height, xFormat, ...options });
  const g = select(node).select('g');

  // Overlay on linear region — lowered below dots so dots still get pointer
  // events for tooltips. Drag is attached here so clicks on empty space in the
  // linear region trigger the pan while clicks on dots reach the dot handlers.
  const overlay = g.append('rect')
      .attr('x', r1).attr('width', Math.max(0, r2 - r1))
      .attr('y', 0).attr('height', innerH)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')
      .attr('tabindex', '0')
      .attr('role', 'slider')
      .attr('aria-label', 'Pan linear section — arrow keys to move, Shift for larger steps')
      .style('outline', 'none')
    .lower();

  // Pan hint — a single badge that rides along centred in the linear window. It announces the
  // gesture on render, then fades after a few seconds. The ←/→ convey that the window slides
  // through the data; "scan the data" implies the whole range is reachable (push to an edge and
  // the window docks and keeps scrolling). It follows the window via positionPanHint() in
  // applyState, so it never gets left behind when you drag.
  const HINT_TEXT = '← drag to scan the data →';
  const hintFontSize = 10, hintPadY = 4, hintPadX = 9;
  const hintH = hintFontSize + hintPadY * 2;
  const hintW = HINT_TEXT.length * 5.5 + hintPadX * 2;
  const hintCy = innerH - hintH / 2 - 4;

  const panHintG = g.append('g').attr('pointer-events', 'none').style('opacity', 0.9);
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

  // Re-centre the badge in the current window; safe to call after it has faded/removed (no-op).
  const positionPanHint = () =>
    panHintG.attr('transform', `translate(${(currentR1 + currentR2) / 2},${hintCy})`);
  positionPanHint();

  panHintG.style('transition', 'opacity 0.8s');
  setTimeout(() => {
    panHintG.style('opacity', 0);
    setTimeout(() => panHintG.remove(), 800);
  }, 3000);

  // Lift dots above the axes/gridlines drawn by createChart.
  g.selectAll('circle').raise();

  // ── Region annotations ────────────────────────────────────────────────────
  // Permanent dimension-line annotations: one per scale region, always visible.
  // Shows the type label ("power" / "linear") above and the data range below.
  const ANNOT_Y   = 24;   // y of the dimension line
  const ANNOT_ARR = 5;    // arrowhead length in px
  const annotFmt  = makeFmt(xFormat);

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
      valueTxt.attr('x', cx).text(annotFmt(hi - lo));
      dimLine.attr('x1', p1 + ANNOT_ARR).attr('x2', p2 - ANNOT_ARR);
      arrL.attr('points', `${p1},${ANNOT_Y} ${p1+ANNOT_ARR},${ANNOT_Y-3} ${p1+ANNOT_ARR},${ANNOT_Y+3}`);
      arrR.attr('points', `${p2},${ANNOT_Y} ${p2-ANNOT_ARR},${ANNOT_Y-3} ${p2-ANNOT_ARR},${ANNOT_Y+3}`);
    };
  }

  const updateLinearAnnot = makeAnnotation('linear');

  const TINT_BASE = 0.02;   // fill opacity of the first (innermost) arrow chunk
  const TINT_STEP = 0.012;  // opacity added per chunk outward
  const TINT_MAX  = 0.10;   // ceiling

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

  const RULER_HEAD   = 2.4;                // ~20% smaller heads → a couple more arrows fit
  const ARROW_MIN_PX = 2 * RULER_HEAD + 9; // ~14px: room for a ←→ arrow
  const TEXT_MIN_PX  = 20;                 // room for a stacked "log" / "×1" label
  const RULER_MIN_PX = 2;                  // chunk narrower than this → stop (density cap)
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
          const val = mult >= 1 ? `×${fmtMult(mult)}` : annotFmt(Math.abs(extreme - d0));
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
          for (let x = denseStart; x <= denseEnd; x += RULER_MIN_PX) {
            posts.push({ id: `dense-post-${x}`, x: x, opacity: 0.14 });
          }
        }
        arrows.push({ id: 'collapse-arrow', x1: a, x2: b, opacity: 0.65 });
        texts.push({ id: 'collapse-lbl-t', x: (a + b) / 2, y: 8, text: 'log', opacity: 0.3, italic: true, size: 9 });
        texts.push({ id: 'collapse-lbl-v', x: (a + b) / 2, y: ANNOT_Y - 2, text: n >= 1 ? `×${fmtMult(n)}` : annotFmt(Math.abs(extreme - collapseAt)), opacity: 0.65, size: 10, weight: '500' });
      }
    }

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

  updateLinearAnnot(r1, r2, xLo, xHi);
  drawTailRuler(leftRulerG,  leftScale,  xLo, xMin, xHi - xLo);
  drawTailRuler(rightRulerG, rightScale, xHi, xMax, xHi - xLo);

  // Report the window the scale actually settled on (after capping) so the page readout
  // reflects what's rendered, not the raw slider quantiles.
  onWindowDrag?.({ xLo, xHi });

  // ── Drag handles ─────────────────────────────────────────────────────────────
  if (onWindowChange) {
    const circles = g.selectAll('circle');

    function applyState(newXLo, newXHi, newR1, newR2) {
      xScale.linearDomain([newXLo, newXHi]).linearRange([newR1, newR2]);
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
      g.select('.x-axis').call(axisBottom(xScale).ticks(6).tickFormat(xFmt));
      updateLinearAnnot(currentR1, currentR2, currentXLo, currentXHi);
      drawTailRuler(leftRulerG,  leftScale,  currentXLo, xMin, currentXHi - currentXLo);
      drawTailRuler(rightRulerG, rightScale, currentXHi, xMax, currentXHi - currentXLo);
      onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi });
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
        .attr('fill-opacity', 0.22);

      [-2, 2].forEach(cx =>
        [-5, 0, 5].forEach(dy =>
          handle.append('circle')
            .attr('class', 'handle-grip')
            .attr('cx', cx).attr('cy', innerH / 2 + dy)
            .attr('r', 1)
            .attr('fill-opacity', 0.6)
        )
      );

      handle.on('mouseenter focus', () => {
        pill.attr('fill-opacity', 0.55);
        handle.select('line').attr('stroke-opacity', 0.6);
      });
      handle.on('mouseleave blur', () => {
        pill.attr('fill-opacity', 0.22);
        handle.select('line').attr('stroke-opacity', 0.3);
      });

      return handle;
    }

    // Declare handles before pan drag so the pan closure can reference them.
    let leftHandle, rightHandle;
    // Set on the first move of any drag; a drag that never moves is a click (see end handlers).
    let dragMoved = false;

    // Pan: the box translates rigidly in pixel space; the domain follows at a uniform
    // dollar-per-pixel rate. When the pointer pushes past a chart edge the box docks and
    // the window AUTO-SCROLLS through the data on a d3.timer, so it keeps going while the
    // pointer is held — speed scaling with how far past the edge the pointer is. The
    // accumulated scroll is folded into the domain so dragging back is seamless.
    const AUTO_GAIN = 0.12;          // overshoot px → fraction of a pan-step per ~frame
    const AUTO_MAX_OVERSHOOT = 120;  // cap so it can't scroll absurdly fast
    // The window must stay within the scale's cap, not the raw data extremes — otherwise
    // panning past the cap pushes both edges onto the bound and collapses the window.
    const [panLo, panHi] = xScale.windowBounds();
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

    const kbStep = event => event.shiftKey ? innerW * 0.02 : 5;

    leftHandle.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const px = Math.max(r0, Math.min(currentR2 - MIN_WINDOW_PX, currentR1 + dir * kbStep(event)));
      applyLeftDrag(px);
      leftHandle.attr('aria-valuenow', currentXLo);
      onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
    });

    rightHandle.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const px = Math.max(currentR1 + MIN_WINDOW_PX, Math.min(r3, currentR2 + dir * kbStep(event)));
      applyRightDrag(px);
      rightHandle.attr('aria-valuenow', currentXHi);
      onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
    });

    overlay.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir   = event.key === 'ArrowRight' ? 1 : -1;
      const boxW  = currentR2 - currentR1;
      const step  = kbStep(event);
      const panRate = (currentXHi - currentXLo) / boxW;
      const newR1 = Math.max(r0, Math.min(r3 - boxW, currentR1 + dir * step));
      const newR2 = newR1 + boxW;
      // Same cap handling as the mouse pan: clamp to the window bounds and shift as a unit so
      // arrow-key panning parks at the cap with its width intact, instead of drifting past it.
      let newXLo = currentXLo + dir * step * panRate;
      let newXHi = currentXHi + dir * step * panRate;
      if (newXLo < panLo) { newXHi -= (newXLo - panLo); newXLo = panLo; }
      if (newXHi > panHi) { newXLo -= (newXHi - panHi); newXHi = panHi; }
      applyState(newXLo, newXHi, newR1, newR2);
      onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
    });

    leftHandle.call(drag()
      .on('drag', event => {
        dragMoved = true;
        const px = Math.max(r0, Math.min(currentR2 - MIN_WINDOW_PX, event.x));
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
        const px = Math.max(currentR1 + MIN_WINDOW_PX, Math.min(r3, event.x));
        applyRightDrag(px);
        onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
      .on('start', () => { dragMoved = false; })
      .on('end', () => {
        if (dragMoved) onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
    );
  }

  return node;
}
