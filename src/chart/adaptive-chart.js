import { scalePow, scaleLinear, scaleLog } from 'd3-scale';
import { extent } from 'd3-array';
import { select } from 'd3-selection';
import { format } from 'd3-format';
import { createChart, MARGIN } from './base-chart.js';
import { detectScaleType } from '../scale/detect.js';
import { windowQuantile, windowKDE, windowMixture } from '../scale/window.js';


// Maps a domain value to [0,1] proportional to its log-distance between xMin and xMax.
// Log-space allocation is smooth by construction — no data-rank dependency, no cluster
// jumps — and matches the visual intent of power-scale tails (compressing outliers
// logarithmically, so log-space pixel allocation is the natural companion).
function logFraction(xMin, xMax, v) {
  if (xMin <= 0 || xMax <= xMin) return 0;
  if (v <= xMin) return 0;
  if (v >= xMax) return 1;
  return Math.log(v / xMin) / Math.log(xMax / xMin);
}

function makeFmt(specifier) {
  if (specifier === 'currency') {
    return v => {
      const abs = Math.abs(v);
      if (abs >= 1e9)  return `$${+(v / 1e9).toPrecision(3)}B`;
      if (abs >= 1e6)  return `$${+(v / 1e6).toPrecision(3)}M`;
      if (abs >= 1e3)  return `$${+(v / 1e3).toPrecision(3)}k`;
      return `$${+v.toPrecision(3)}`;
    };
  }
  return format(specifier);
}

export function createAdaptiveChart(points, {
  width = 900, height = 260,
  window = 0.5,
  xFormat = '~s',
  mode,
  windowMethod = 'quantile',
  ...options
} = {}) {
  if (!points?.length) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const resolvedMode = mode ?? detectScaleType(points.map(d => d.x));

  return resolvedMode === 'log'
    ? renderLog(points, { width, height, xFormat, ...options })
    : renderPiecewise(points, { width, height, window, windowMethod, xFormat, ...options });
}

// ── Log mode ──────────────────────────────────────────────────────────────────

function renderLog(points, { width, height, xFormat, ...options }) {
  const xFmt = makeFmt(xFormat);
  const [xMin, xMax] = extent(points, d => d.x);
  const innerW = width  - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top  - MARGIN.bottom;

  const xScale = scaleLog().domain([xMin, xMax]).range([0, innerW]).nice();

  const node = createChart(points, xScale, { width, height, xFormat, ...options });

  return node;
}

// ── Piecewise mode ────────────────────────────────────────────────────────────

function renderPiecewise(points, { width, height, window, windowMethod, xFormat, ...options }) {
  const innerW = width  - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top  - MARGIN.bottom;
  const [xMin, xMax] = extent(points, d => d.x);
  const xValues = points.map(d => d.x);

  const METHODS = { quantile: windowQuantile, kde: windowKDE, mixture: windowMixture };
  const { xLo: rawLo, xHi: rawHi } = (METHODS[windowMethod] ?? windowQuantile)(xValues, window);

  // Clamp only to prevent zero-length sub-scales, not by a percentage of range
  // (a percentage clamp breaks for datasets with extreme ranges like 1→250M).
  const eps = (xMax - xMin) * 1e-9;
  const xLo = Math.max(xMin + eps, Math.min(rawLo, xMax - 2 * eps));
  const xHi = Math.min(xMax - eps, Math.max(rawHi, xMin + 2 * eps));
  if (xLo >= xHi) return renderLog(points, { width, height, xFormat, ...options });

  // Pixel boundaries must be smooth as the slider moves.
  //
  // Quantile: derive from slider fraction directly — perfectly linear in slider,
  // zero data dependency, zero cluster sensitivity.
  //
  // KDE / Mixture: xLo = exp(mu ± k·σ) is smooth in log-space, so logFraction
  // maps it to pixels smoothly. smoothFraction can't be used here because it maps
  // through the empirical CDF, which jumps at data clusters.
  let qLo, qHi;
  if (windowMethod === 'quantile' || !windowMethod) {
    qLo = Math.max(0, 0.5 - window / 2);
    qHi = Math.min(1, 0.5 + window / 2);
  } else {
    qLo = logFraction(xMin, xMax, xLo);
    qHi = logFraction(xMin, xMax, xHi);
  }

  const r0 = 0;
  const r1 = innerW * qLo;
  const r2 = innerW * qHi;
  const r3 = innerW;

  const leftScale  = scalePow().exponent(0.3).domain([xMin, xLo]).range([r0, r1]);
  const midScale   = scaleLinear().domain([xLo, xHi]).range([r1, r2]);
  const rightScale = scalePow().exponent(0.3).domain([xHi, xMax]).range([r2, r3]);

  function xScale(v) {
    if (v <= xLo) return leftScale(v);
    if (v <= xHi) return midScale(v);
    return rightScale(v);
  }
  xScale.domain = () => [xMin, xMax];
  xScale.range  = () => [0, innerW];
  xScale.copy   = () => xScale;
  xScale.ticks  = (count = 8) => {
    const tl = qLo > 0 ? leftScale.ticks(Math.max(1, Math.round(count * qLo)))         : [];
    const tm =            midScale.ticks(Math.max(1, Math.round(count * (qHi - qLo)))) ;
    const tr = qHi < 1 ? rightScale.ticks(Math.max(1, Math.round(count * (1 - qHi))))  : [];
    return [...tl, ...tm, ...tr];
  };

  const node = createChart(points, xScale, { width, height, xFormat, ...options });
  const g = select(node).select('g');

  // White overlay on linear region
  g.append('rect')
      .attr('x', r1).attr('width', Math.max(0, r2 - r1))
      .attr('y', 0).attr('height', innerH)
      .attr('fill', 'white').attr('fill-opacity', 0.07)
      .attr('pointer-events', 'none')
    .lower();

  // Tick lines at each linear-section-width interval into the tails
  const drawTick = px => g.append('line')
    .attr('x1', px).attr('x2', px)
    .attr('y1', 0).attr('y2', innerH)
    .attr('stroke', 'white').attr('stroke-opacity', 0.25)
    .attr('stroke-width', 1).attr('pointer-events', 'none');

  // scalePow.ticks(n) returns at most n nicely-spaced values — D3's own tick
  // algorithm, the same one d3-axis uses. Budget ticks proportional to pixel space
  // so a narrow tail gets 1–2 lines and a wide one gets up to 6.
  const leftBudget  = Math.max(1, Math.round(6 * qLo));
  const rightBudget = Math.max(1, Math.round(6 * (1 - qHi)));
  leftScale.ticks(leftBudget).forEach(v   => drawTick(xScale(v)));
  rightScale.ticks(rightBudget).forEach(v => drawTick(xScale(v)));

  return node;
}
