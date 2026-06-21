import { scaleLinear, scaleLog, scaleSymlog } from 'd3-scale';
import { extent } from 'd3-array';
import { select } from 'd3-selection';
import { drag } from 'd3-drag';
import { axisBottom } from 'd3-axis';
import { createChart, makeFmt, MARGIN } from './base-chart.js';
import { detectScaleType } from '../scale/detect.js';
import { windowQuantile } from '../scale/window.js';

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
  overlayColor = 'white',
  tickColor = 'white',
  chartBg,             // chart background color for text halo on span annotation
  ...options
} = {}) {
  if (!points?.length) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const resolvedMode = mode ?? detectScaleType(points.map(d => d.x));

  return resolvedMode === 'log'
    ? renderLog(points, { width, height, xFormat, ...options })
    : renderPiecewise(points, {
        width, height, window, xFormat,
        xLoOverride, xHiOverride, qLoOverride, qHiOverride, onWindowDrag, onWindowChange,
        tailTicks, overlayColor, tickColor, chartBg,
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

// ── Symmetric-log tail scale ──────────────────────────────────────────────────
// A plain log scale measures ratio, which is lopsided around a centre: ratios are
// unbounded going up but bottom out at zero going down, so a log tail always
// expands its small end. The symmetric quantity is DISTANCE OUTWARD from the
// linear-window boundary — exactly what d3.scaleSymlog compresses. Each tail is a
// real symlog fed boundary-relative distance, so BOTH tails compress outward by the
// same law. The law is symmetric; the OUTPUT is not forced to be — a tail whose
// data range is small stays near-linear, a tail with a huge range compresses hard.
// True visual symmetry therefore appears only when the data is actually symmetric
// (equal outlier range either side of a centred window); we never normalise the
// constant to fake a mirror.

// Pick the symlog constant C so the tail's slope at the boundary (distance 0) equals
// the linear window's slope T (px per $): the represented density is continuous
// across the seam, with no artificial jump, and C is *derived* from the data and
// geometry rather than chosen to hit a look. d3's symlog boundary slope is
// A / (C·ln(1 + S/C)) for range-width A over span S; it falls monotonically from
// +∞ (C→0) to A/S (C→∞), so geometric-bisect for the unique C (or fall back to a
// near-linear tail when the window is shallower than the tail's own average).
function solveSymlogConstant(A, S, T) {
  if (!(S > 0) || !(A > 0) || !(T > 0)) return 1;
  if (T <= A / S) return S; // window shallower than the tail average → near-linear tail
  const slopeAt = C => A / (C * Math.log1p(S / C));
  let lo = S * 1e-9, hi = S * 1e9; // slopeAt(lo) ≫ T, slopeAt(hi) ≈ A/S < T
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi); // C spans many orders of magnitude
    if (slopeAt(mid) > T) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

function symlogTail(boundary, extreme, pBoundary, pExtreme, windowSlope) {
  const span    = Math.abs(extreme - boundary) || 1;
  const outward = Math.sign(extreme - boundary) || 1; // +1 right tail, −1 left tail
  const base    = scaleSymlog().domain([0, span]).range([pBoundary, pExtreme]);
  base.constant(solveSymlogConstant(Math.abs(pExtreme - pBoundary), span, windowSlope));

  const scale      = x => base(outward * (x - boundary)); // feed distance from the boundary
  scale.invert     = px => boundary + outward * base.invert(px);
  scale.ticks      = n => base.ticks(n).map(d => boundary + outward * d);
  scale.tickFormat = (n, s) => base.tickFormat(n, s);
  scale.domain     = () => outward > 0 ? [boundary, extreme] : [extreme, boundary];
  scale.range      = () => outward > 0 ? [pBoundary, pExtreme] : [pExtreme, pBoundary];
  scale.copy       = () => symlogTail(boundary, extreme, pBoundary, pExtreme, windowSlope);
  return scale;
}

function renderPiecewise(points, {
  width, height, window, xFormat,
  xLoOverride, xHiOverride, qLoOverride, qHiOverride, onWindowDrag, onWindowChange,
  tailTicks, overlayColor, tickColor, chartBg,
  ...options
}) {
  const innerW = width  - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top  - MARGIN.bottom;
  const [xMin, xMax] = extent(points, d => d.x);
  const xValues = points.map(d => d.x);

  // Use drag-handle overrides when present, otherwise quantile from slider
  const { xLo: rawLo, xHi: rawHi } =
    xLoOverride != null && xHiOverride != null
      ? { xLo: xLoOverride, xHi: xHiOverride }
      : windowQuantile(xValues, window);

  const eps = (xMax - xMin) * 1e-9;
  const xLo = Math.max(xMin + eps, Math.min(rawLo, xMax - 2 * eps));
  const xHi = Math.min(xMax - eps, Math.max(rawHi, xMin + 2 * eps));
  if (xLo >= xHi) return renderLog(points, { width, height, xFormat, ...options });

  // Pixel allocation: use handle-drag overrides when present, else slider-derived
  const qLo = qLoOverride ?? Math.max(0, 0.5 - window / 2);
  const qHi = qHiOverride ?? Math.min(1, 0.5 + window / 2);

  const r0 = 0;
  const r1 = innerW * qLo;
  const r2 = innerW * qHi;
  const r3 = innerW;

  // Both tails are symmetric symlogs anchored at the linear-window boundary, so
  // small-value outliers on the left compress toward the left edge exactly as
  // large-value outliers compress toward the right edge. symlog handles 0/negatives
  // natively, so no positive-domain clamp is needed.
  const buildScales = (lo, hi, p1, p2) => {
    const windowSlope = (p2 - p1) / (hi - lo); // px per $ in the linear window
    return {
      leftScale:  symlogTail(lo,  xMin, p1, r0, windowSlope), // boundary lo→p1, extreme xMin→r0
      midScale:   scaleLinear().domain([lo, hi]).range([p1, p2]),
      rightScale: symlogTail(hi, xMax, p2, r3, windowSlope),  // boundary hi→p2, extreme xMax→r3
    };
  };

  let { leftScale, midScale, rightScale } = buildScales(xLo, xHi, r1, r2);

  // Mutable window state the scale reads, so a drag can update the scale (and the axis)
  // in place. leftScale/midScale/rightScale are reassigned on drag too (see applyState).
  let currentXLo = xLo, currentXHi = xHi, currentR1 = r1, currentR2 = r2;

  function xScale(v) {
    if (v <= currentXLo) return leftScale(v);
    if (v <= currentXHi) return midScale(v);
    return rightScale(v);
  }
  xScale.domain = () => [xMin, xMax];
  xScale.range  = () => [0, innerW];
  xScale.copy   = () => xScale;
  xScale.ticks  = (count = 8) => {
    const qlo = currentR1 / innerW, qhi = currentR2 / innerW;
    const tl = qlo > 0 ? leftScale.ticks(Math.max(1, Math.round(count * qlo)))          : [];
    const tm =           midScale.ticks(Math.max(1, Math.round(count * (qhi - qlo))));
    const tr = qhi < 1 ? rightScale.ticks(Math.max(1, Math.round(count * (1 - qhi))))   : [];
    // Always include xMax so the axis labels the right data boundary.
    // Then cull any tick whose pixel position is within 20px of the previous one —
    // sub-scale boundaries and the explicit xMax can produce near-duplicates.
    const raw = [...tl, ...tm, ...tr, xMax];
    const MIN_TICK_PX = 20;
    const culled = [];
    let lastPx = -Infinity;
    for (const v of raw) {
      const px = xScale(v);
      if (px - lastPx >= MIN_TICK_PX) { culled.push(v); lastPx = px; }
    }
    return culled;
  };
  // Invert is needed for drag handles: pixel → domain value
  xScale.invert = px => {
    const p = Math.max(r0, Math.min(r3, px));
    if (p <= currentR1) return leftScale.invert(p);
    if (p <= currentR2) return midScale.invert(p);
    return rightScale.invert(p);
  };
  // d3-axis calls scale.tickFormat(count, specifier) when no explicit formatter is set.
  // Delegate to the linear mid-section — it determines the "natural" numeric precision.
  xScale.tickFormat = (count, specifier) => midScale.tickFormat(count, specifier);

  // Held for redrawing the x-axis live on drag (mirrors base-chart's styling).
  const xFmt          = makeFmt(xFormat);
  const axisColor     = options.axisColor ?? '#3a3a6a';
  const axisTextColor = options.axisTextColor ?? '#a0a0c0';

  const node = createChart(points, xScale, { width, height, xFormat, ...options });
  const g = select(node).select('g');

  // Overlay on linear region — lowered below dots so dots still get pointer
  // events for tooltips. Drag is attached here so clicks on empty space in the
  // linear region trigger the pan while clicks on dots reach the dot handlers.
  const overlay = g.append('rect')
      .attr('x', r1).attr('width', Math.max(0, r2 - r1))
      .attr('y', 0).attr('height', innerH)
      .attr('fill', overlayColor).attr('fill-opacity', 0)
      .attr('pointer-events', 'all')
      .attr('tabindex', '0')
      .attr('role', 'slider')
      .attr('aria-label', 'Pan linear section — arrow keys to move, Shift for larger steps')
      .style('outline', 'none')
    .lower();

  // Pan hint — appears at top and bottom of the linear section, fades after 3 s
  const hintText = '← drag to pan →';
  const hintFontSize = 10;
  const hintPadX = 9, hintPadY = 4;
  const hintW = hintText.length * 5.5 + hintPadX * 2;
  const hintH = hintFontSize + hintPadY * 2;
  const hintX = (r1 + r2) / 2;

  [hintH / 2 + 4, innerH - hintH / 2 - 4].forEach(cy => {
    const hg = g.append('g').attr('pointer-events', 'none').style('opacity', 0.9);
    hg.append('rect')
      .attr('x', hintX - hintW / 2).attr('y', cy - hintH / 2)
      .attr('width', hintW).attr('height', hintH).attr('rx', hintH / 2)
      .attr('fill', tickColor).attr('fill-opacity', 0.12)
      .attr('stroke', tickColor).attr('stroke-opacity', 0.3).attr('stroke-width', 1);
    hg.append('text')
      .attr('x', hintX).attr('y', cy + hintFontSize * 0.35)
      .attr('text-anchor', 'middle')
      .attr('fill', tickColor).attr('fill-opacity', 0.65)
      .attr('font-size', `${hintFontSize}px`)
      .text(hintText);
    hg.style('transition', 'opacity 0.8s');
    setTimeout(() => {
      hg.style('opacity', 0);
      setTimeout(() => hg.remove(), 800);
    }, 3000);
  });

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
      .attr('fill', tickColor).attr('fill-opacity', 0.3)
      .attr('font-size', '9px').attr('font-style', 'italic')
      .text(typeLabel);

    const valueTxt = grp.append('text')
      .attr('class', 'annot-value').attr('y', ANNOT_Y - 2).attr('text-anchor', 'middle')
      .attr('fill', tickColor).attr('fill-opacity', 0.65)
      .attr('font-size', '10px').attr('font-weight', '500')
      .style('paint-order', 'stroke fill');
    if (chartBg) valueTxt.attr('stroke', chartBg).attr('stroke-width', 3);

    const dimLine = grp.append('line')
      .attr('y1', ANNOT_Y).attr('y2', ANNOT_Y)
      .attr('stroke', tickColor).attr('stroke-opacity', 0.45).attr('stroke-width', 1);
    const arrL = grp.append('polygon').attr('fill', tickColor).attr('fill-opacity', 0.45);
    const arrR = grp.append('polygon').attr('fill', tickColor).attr('fill-opacity', 0.45);

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

  // Each log tail gets a faint tint — a touch lighter than the linear section — so the
  // regions stay visually distinct now that the hatch is gone. Lowered below the dots.
  const TINT_OPACITY = 0.05;
  const leftTintRect  = g.append('rect').attr('y', 0).attr('height', innerH)
    .attr('fill', tickColor).attr('fill-opacity', TINT_OPACITY).attr('pointer-events', 'none')
    .attr('x', r0).attr('width', r1 - r0).lower();
  const rightTintRect = g.append('rect').attr('y', 0).attr('height', innerH)
    .attr('fill', tickColor).attr('fill-opacity', TINT_OPACITY).attr('pointer-events', 'none')
    .attr('x', r2).attr('width', r3 - r2).lower();

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
  // Multiplier formatter: SI for huge counts, a decimal when < 1 window, plain integers.
  const fmtMult = n => n >= 1000 ? makeFmt('~s')(n)
                     : n >= 10   ? Math.round(n).toString()
                     : Number.isInteger(n) ? n.toString() : n.toFixed(1);
  function drawTailRuler(grp, sub, boundary, extreme, W) {
    grp.selectAll('*').remove();
    if (!(W > 0) || boundary === extreme) return;
    const outward = Math.sign(extreme - boundary) || 1;
    const hy = 3;
    const arrow = (a, b, op) => {
      grp.append('line').attr('x1', a + RULER_HEAD).attr('x2', b - RULER_HEAD).attr('y1', ANNOT_Y).attr('y2', ANNOT_Y)
        .attr('stroke', tickColor).attr('stroke-opacity', op).attr('stroke-width', 1);
      grp.append('polygon').attr('fill', tickColor).attr('fill-opacity', op)
        .attr('points', `${a},${ANNOT_Y} ${a + RULER_HEAD},${ANNOT_Y - hy} ${a + RULER_HEAD},${ANNOT_Y + hy}`);
      grp.append('polygon').attr('fill', tickColor).attr('fill-opacity', op)
        .attr('points', `${b},${ANNOT_Y} ${b - RULER_HEAD},${ANNOT_Y - hy} ${b - RULER_HEAD},${ANNOT_Y + hy}`);
    };
    // Each section's label mirrors the linear annotation: italic "log" on top, value below.
    const label = (x, value, valOp) => {
      grp.append('text').attr('x', x).attr('y', 8).attr('text-anchor', 'middle')
        .attr('fill', tickColor).attr('fill-opacity', 0.3).attr('font-size', '9px').attr('font-style', 'italic')
        .text('log');
      grp.append('text').attr('x', x).attr('y', ANNOT_Y - 2).attr('text-anchor', 'middle')
        .attr('fill', tickColor).attr('fill-opacity', valOp).attr('font-size', '10px').attr('font-weight', '500')
        .text(value);
    };

    // Each W-chunk is one linear window. Post at every boundary; an arrow on each chunk
    // wide enough; a "log ×1" label where text fits (×0.5 etc. on a clamped partial chunk).
    // Once a chunk is too small even for an arrow, remember where and stop labelling.
    let collapseAt = null;
    for (let k = 0; k < 4000; k++) {
      const d0 = boundary + outward * k * W;
      let d1 = boundary + outward * (k + 1) * W;
      const beyond = outward > 0 ? d1 >= extreme : d1 <= extreme;
      if (beyond) d1 = extreme;
      const a = Math.min(sub(d0), sub(d1)), b = Math.max(sub(d0), sub(d1));
      const w = b - a;
      if (w < RULER_MIN_PX) break;
      const post = outward > 0 ? b : a;
      grp.append('line').attr('x1', post).attr('x2', post).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', tickColor).attr('stroke-opacity', 0.14).attr('stroke-width', 1);
      if (w >= ARROW_MIN_PX) {
        arrow(a, b, 0.45);
        if (w >= TEXT_MIN_PX) label((a + b) / 2, `×${fmtMult(beyond ? Math.abs(extreme - d0) / W : 1)}`, 0.65);
      } else if (collapseAt === null) {
        collapseAt = d0;                  // first chunk too small for even an arrow
      }
      if (beyond) break;
    }

    // The remaining compressed chunks collapse into ONE arrow — "all the extra logs" —
    // labelled with how many linear windows it stands for (the count comes from the scale).
    if (collapseAt !== null) {
      const a = Math.min(sub(collapseAt), sub(extreme)), b = Math.max(sub(collapseAt), sub(extreme));
      const n = Math.abs(extreme - collapseAt) / W;
      if (n >= 1 && b - a > 1) {
        if (b - a >= 2 * RULER_HEAD + 2) arrow(a, b, 0.65);
        else grp.append('line').attr('x1', a).attr('x2', b).attr('y1', ANNOT_Y).attr('y2', ANNOT_Y)
          .attr('stroke', tickColor).attr('stroke-opacity', 0.65).attr('stroke-width', 1);
        label((a + b) / 2, `×${fmtMult(n)}`, 0.65);
      }
    }
  }

  updateLinearAnnot(r1, r2, xLo, xHi);
  drawTailRuler(leftRulerG,  leftScale,  xLo, xMin, xHi - xLo);
  drawTailRuler(rightRulerG, rightScale, xHi, xMax, xHi - xLo);

  // ── Drag handles ─────────────────────────────────────────────────────────────
  if (onWindowChange) {
    const circles = g.selectAll('circle');

    function applyState(newXLo, newXHi, newR1, newR2) {
      // Reassign the scale state xScale closes over, then everything reads the new window.
      ({ leftScale, midScale, rightScale } = buildScales(newXLo, newXHi, newR1, newR2));
      currentXLo = newXLo; currentXHi = newXHi;
      currentR1  = newR1;  currentR2  = newR2;
      circles.attr('cx', d => xScale(d.x));
      overlay.attr('x', newR1).attr('width', Math.max(0, newR2 - newR1));
      leftHandle?.attr('transform',  `translate(${newR1},0)`);
      rightHandle?.attr('transform', `translate(${newR2},0)`);
      // Live x-axis redraw — same styling base-chart applies on first render.
      g.select('.x-axis').call(axisBottom(xScale).ticks(6).tickFormat(xFmt))
        .call(a => a.select('.domain').attr('stroke', axisColor))
        .call(a => a.selectAll('.tick line').attr('stroke', axisColor))
        .call(a => a.selectAll('.tick text').attr('fill', axisTextColor).attr('font-size', '10px'));
      updateLinearAnnot(newR1, newR2, newXLo, newXHi);
      leftTintRect.attr('width', newR1 - r0);
      rightTintRect.attr('x', newR2).attr('width', r3 - newR2);
      drawTailRuler(leftRulerG,  leftScale,  newXLo, xMin, newXHi - newXLo);
      drawTailRuler(rightRulerG, rightScale, newXHi, xMax, newXHi - newXLo);
      onWindowDrag?.({ xLo: newXLo, xHi: newXHi });
    }

    function applyLeftDrag(px) {
      // Position the new boundary by inverting a full-span symlog proxy over
      // [r0, currentR2] → [xMin, currentXHi]. Using the full pixel span (not the
      // tiny left tail) keeps the inverse bounded, and symlog handles a $0 xMin
      // that scaleLog cannot.
      const raw = scaleSymlog().domain([xMin, currentXHi]).range([r0, currentR2]).invert(px);
      const newXLo = Math.max(xMin + eps, raw);
      applyState(newXLo, currentXHi, px, currentR2);
      return newXLo;
    }

    function applyRightDrag(px) {
      const raw = scaleSymlog().domain([currentXLo, xMax]).range([currentR1, r3]).invert(px);
      const newXHi = Math.min(xMax - eps, raw);
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
        .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', tickColor).attr('stroke-width', 1).attr('stroke-opacity', 0.3)
        .style('pointer-events', 'none');

      const pillW = 8, pillH = 20;
      const pillY  = innerH / 2 - pillH / 2;
      const pill = handle.append('rect')
        .attr('x', -pillW / 2).attr('y', pillY)
        .attr('width', pillW).attr('height', pillH)
        .attr('rx', pillW / 2)
        .attr('fill', tickColor).attr('fill-opacity', 0.22);

      [-2, 2].forEach(cx =>
        [-5, 0, 5].forEach(dy =>
          handle.append('circle')
            .attr('cx', cx).attr('cy', innerH / 2 + dy)
            .attr('r', 1)
            .attr('fill', tickColor).attr('fill-opacity', 0.6)
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

    // Pan: the box translates rigidly in pixel space. Domain values are derived
    // by a uniform linear rate (mid-scale units/pixel) so 1px of pan always equals
    // the same dollar step — no jump when the box crosses the initial boundaries.
    let panStartX = 0, panStartR1 = r1, panStartXLo = xLo, panStartXHi = xHi;

    overlay.call(drag()
      .on('start', event => {
        panStartX   = event.x;
        panStartR1  = currentR1;
        panStartXLo = currentXLo;
        panStartXHi = currentXHi;
        overlay.style('cursor', 'grabbing');
      })
      .on('drag', event => {
        const boxW    = currentR2 - currentR1;
        const panRate = (currentXHi - currentXLo) / boxW; // domain units per pixel
        const delta   = event.x - panStartX;
        const newR1   = Math.max(r0, Math.min(r3 - boxW, panStartR1 + delta));
        const newR2   = newR1 + boxW;
        const rawDelta = (newR1 - panStartR1) * panRate;
        let newXLo = panStartXLo + rawDelta;
        let newXHi = panStartXHi + rawDelta;
        if (newXLo < xMin + eps) { newXHi -= (newXLo - (xMin + eps)); newXLo = xMin + eps; }
        if (newXHi > xMax   - eps) { newXLo -= (newXHi - (xMax   - eps)); newXHi = xMax   - eps; }
        applyState(newXLo, newXHi, newR1, newR2);
      })
      .on('end', () => {
        overlay.style('cursor', null);
        onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
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
      const newXLo = Math.max(xMin, currentXLo + dir * step * panRate);
      const newXHi = Math.min(xMax, currentXHi + dir * step * panRate);
      applyState(newXLo, newXHi, newR1, newR2);
      onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
    });

    leftHandle.call(drag()
      .on('drag', event => {
        const px = Math.max(r0, Math.min(currentR2 - MIN_WINDOW_PX, event.x));
        applyLeftDrag(px);
      })
      .on('end', () => {
        onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
    );

    rightHandle.call(drag()
      .on('drag', event => {
        const px = Math.max(currentR1 + MIN_WINDOW_PX, Math.min(r3, event.x));
        applyRightDrag(px);
      })
      .on('end', () => {
        onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
    );
  }

  return node;
}
