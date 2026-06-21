import { scaleLinear, scaleLog, scaleSymlog } from 'd3-scale';
import { extent } from 'd3-array';
import { select } from 'd3-selection';
import { drag } from 'd3-drag';
import { axisBottom } from 'd3-axis';
import { timer } from 'd3-timer';
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

  // Fixed candidate pool over the whole data range. Because the VALUES never change, a
  // pan slides each tick smoothly instead of re-rounding it every frame (the cause of
  // the flicker). Log covers the low end finely; linear covers the high end finely
  // (where a tail with a high-valued boundary expands and needs labels).
  const tickPool = (() => {
    const set = new Set();
    const lop = xMin > 0 ? xMin : Math.max(1e-9, xMax * 1e-7);
    scaleLog().domain([lop, xMax]).ticks(100).forEach(v => set.add(v));
    scaleLinear().domain([0, xMax]).ticks(100).forEach(v => { if (v > 0) set.add(v); });
    return [...set];
  })();
  // Niceness rank for de-confliction: 10ᵏ > 5·10ᵏ > 2·10ᵏ > other integer mantissa > rest,
  // then by magnitude. Per-value (never position), so the kept set is stable under pan.
  const tickPriority = v => {
    if (!(v > 0)) return 0;
    const e = Math.floor(Math.log10(v) + 1e-9);
    const m = v / 10 ** e;
    const r = Math.abs(m - 1) < 1e-6 ? 4 : Math.abs(m - 5) < 1e-6 ? 3
            : Math.abs(m - 2) < 1e-6 ? 2 : Math.abs(m - Math.round(m)) < 1e-6 ? 1 : 0;
    return r * 1000 + e;
  };

  function xScale(v) {
    if (v <= currentXLo) return leftScale(v);
    if (v <= currentXHi) return midScale(v);
    return rightScale(v);
  }
  xScale.domain = () => [xMin, xMax];
  xScale.range  = () => [0, innerW];
  xScale.copy   = () => xScale;
  xScale.ticks  = () => {
    // Stable pool + the linear window's own adaptive ticks (for narrow windows), mapped
    // through the current piecewise scale. Keep by niceness priority: a tick shows unless
    // a ROUNDER one already sits within MIN_TICK_PX. Priority is per-value, so as the axis
    // pans the round ticks always win and finer ones fill expanded regions — no flicker,
    // no left-anchored reshuffling. (No greedy left-to-right cull, which reshuffles.)
    const MIN_TICK_PX = 42;
    const cands = new Set(tickPool);
    midScale.ticks(10).forEach(v => cands.add(v));
    cands.add(xMax);
    const placed = [...cands]
      .map(v => ({ v, px: xScale(v), pr: tickPriority(v) }))
      .filter(c => c.px >= -1 && c.px <= innerW + 1)
      .sort((a, b) => b.pr - a.pr);
    const kept = [];
    for (const c of placed) if (kept.every(k => Math.abs(k.px - c.px) >= MIN_TICK_PX)) kept.push(c);
    return kept.sort((a, b) => a.px - b.px).map(c => c.v);
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

  // Pan hints — pill badges spread across the linear section.
  // Tiered: 3 badges for wide linear zones, 2 edge-only for medium, 1 center for narrow.
  const hintFontSize = 10, hintPadY = 4;
  const hintH = hintFontSize + hintPadY * 2;
  const linearW = r2 - r1;
  const charW = 5.5;
  // Edge badges use tighter padding (6px) so they fit in narrower linear zones.
  const hw = (t, px) => t.length * charW + px * 2;

  const EDGE_L = '← pan', EDGE_R = 'pan →', CENTER = 'drag to pan';
  const EPX = 6, CPX = 9;  // edge and center horizontal padding
  const wL = hw(EDGE_L, EPX), wR = hw(EDGE_R, EPX), wC = hw(CENTER, CPX);
  const inset = 8;

  const fits3 = linearW >= wL / 2 + inset + 12 + wC + 12 + inset + wR / 2;
  const fits2 = linearW >= wL + wR + inset * 2 + 4;

  const hints = [];
  if (fits3) {
    hints.push({ text: EDGE_L, px: EPX, x: r1 + wL / 2 + inset });
    hints.push({ text: CENTER,  px: CPX, x: (r1 + r2) / 2 });
    hints.push({ text: EDGE_R, px: EPX, x: r2 - wR / 2 - inset });
  } else if (fits2) {
    hints.push({ text: EDGE_L, px: EPX, x: r1 + wL / 2 + inset });
    hints.push({ text: EDGE_R, px: EPX, x: r2 - wR / 2 - inset });
  } else {
    hints.push({ text: CENTER, px: CPX, x: (r1 + r2) / 2 });
  }
  const cy = innerH - hintH / 2 - 4;

  hints.forEach(s => {
    const w = hw(s.text, s.px);
    const hg = g.append('g').attr('pointer-events', 'none').style('opacity', 0.9);
    hg.append('rect')
      .attr('x', s.x - w / 2).attr('y', cy - hintH / 2)
      .attr('width', w).attr('height', hintH).attr('rx', hintH / 2)
      .attr('fill', tickColor).attr('fill-opacity', 0.12)
      .attr('stroke', tickColor).attr('stroke-opacity', 0.3).attr('stroke-width', 1);
    hg.append('text')
      .attr('x', s.x).attr('y', cy + hintFontSize * 0.35)
      .attr('text-anchor', 'middle')
      .attr('fill', tickColor).attr('fill-opacity', 0.65)
      .attr('font-size', `${hintFontSize}px`)
      .text(s.text);
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

    // Each W-chunk is one linear window. Every chunk gets a fill (arrow chunks also get an
    // arrow+label; post-only chunks just get the fill and post). The fill gradient runs
    // continuously across both types so there is no visual break at the arrow→post transition.
    let collapseAt = null, lastDrawnK = -1;
    for (let k = 0; k < 4000; k++) {
      const d0 = boundary + outward * k * W;
      let d1 = boundary + outward * (k + 1) * W;
      const beyond = outward > 0 ? d1 >= extreme : d1 <= extreme;
      if (beyond) d1 = extreme;
      const a = Math.min(sub(d0), sub(d1)), b = Math.max(sub(d0), sub(d1));
      const w = b - a;
      if (w < RULER_MIN_PX) break;
      grp.append('rect').attr('x', a).attr('width', w).attr('y', 0).attr('height', innerH)
        .attr('fill', tickColor).attr('fill-opacity', Math.min(TINT_BASE + k * TINT_STEP, TINT_MAX))
        .attr('pointer-events', 'none');
      const post = outward > 0 ? b : a;
      grp.append('line').attr('x1', post).attr('x2', post).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', tickColor).attr('stroke-opacity', 0.14).attr('stroke-width', 1);
      if (w >= ARROW_MIN_PX) {
        arrow(a, b, 0.45);
        if (w >= TEXT_MIN_PX) label((a + b) / 2, `×${fmtMult(beyond ? Math.abs(extreme - d0) / W : 1)}`, 0.65);
      } else if (collapseAt === null) {
        collapseAt = d0;
      }
      lastDrawnK = k;
      if (beyond) break;
    }

    // Sub-RULER_MIN_PX chunks are too small to draw individually. Fill that remaining region
    // at the same opacity as the last drawn chunk (seamless gradient continuation), then
    // annotate the entire post-only + sub-px zone with a single collapse arrow.
    if (collapseAt !== null) {
      const a = Math.min(sub(collapseAt), sub(extreme)), b = Math.max(sub(collapseAt), sub(extreme));
      const n = Math.abs(extreme - collapseAt) / W;
      if (n >= 1 && b - a > 1) {
        const subEdge = boundary + outward * (lastDrawnK + 1) * W;
        const sa = Math.min(sub(subEdge), sub(extreme)), sb = Math.max(sub(subEdge), sub(extreme));
        if (sb > sa) {
          grp.append('rect').attr('x', sa).attr('width', sb - sa).attr('y', 0).attr('height', innerH)
            .attr('fill', tickColor)
            .attr('fill-opacity', Math.min(TINT_BASE + Math.max(0, lastDrawnK) * TINT_STEP, TINT_MAX))
            .attr('pointer-events', 'none');
          // Skip one step at the seam: the last drawn chunk already has a post there.
          const denseStart = outward > 0 ? sa + RULER_MIN_PX : sa;
          const denseEnd   = outward > 0 ? sb : sb - RULER_MIN_PX;
          for (let x = denseStart; x <= denseEnd; x += RULER_MIN_PX)
            grp.append('line').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', innerH)
              .attr('stroke', tickColor).attr('stroke-opacity', 0.14).attr('stroke-width', 1);
        }
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
      drawTailRuler(leftRulerG,  leftScale,  newXLo, xMin, newXHi - newXLo);
      drawTailRuler(rightRulerG, rightScale, newXHi, xMax, newXHi - newXLo);
      onWindowDrag?.({ xLo: newXLo, xHi: newXHi });
    }

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

    // Pan: the box translates rigidly in pixel space; the domain follows at a uniform
    // dollar-per-pixel rate. When the pointer pushes past a chart edge the box docks and
    // the window AUTO-SCROLLS through the data on a d3.timer, so it keeps going while the
    // pointer is held — speed scaling with how far past the edge the pointer is. The
    // accumulated scroll is folded into the domain so dragging back is seamless.
    const AUTO_GAIN = 0.12;          // overshoot px → fraction of a pan-step per ~frame
    const AUTO_MAX_OVERSHOOT = 120;  // cap so it can't scroll absurdly fast
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
      if (newXLo < xMin + eps) { newXHi -= (newXLo - (xMin + eps)); newXLo = xMin + eps; }
      if (newXHi > xMax - eps) { newXLo -= (newXHi - (xMax - eps)); newXHi = xMax - eps; }
      applyState(newXLo, newXHi, newR1, newR2);
    }

    overlay.call(drag()
      .on('start', event => {
        panStartX = event.x; panPointerX = event.x;
        panStartR1 = currentR1; panStartXLo = currentXLo; panStartXHi = currentXHi;
        panBoxW = currentR2 - currentR1; panRate = (currentXHi - currentXLo) / panBoxW;
        panAutoAccum = 0; panPrevElapsed = 0;
        overlay.style('cursor', 'grabbing');
        panTimer = timer(elapsed => {
          const dt = Math.min(elapsed - panPrevElapsed, 50); panPrevElapsed = elapsed;
          const over = panOvershoot();
          // Only keep scrolling while there's data left to reveal in that direction.
          const canScroll = over > 0 ? currentXHi < xMax - eps * 2
                          : over < 0 ? currentXLo > xMin + eps * 2 : false;
          if (canScroll) { panAutoAccum += over * panRate * AUTO_GAIN * (dt / 16); panApply(); }
        });
      })
      .on('drag', event => { panPointerX = event.x; panApply(); })
      .on('end', () => {
        if (panTimer) { panTimer.stop(); panTimer = null; }
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
