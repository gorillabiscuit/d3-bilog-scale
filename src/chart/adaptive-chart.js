import { scalePow, scaleLinear, scaleLog } from 'd3-scale';
import { extent } from 'd3-array';
import { select } from 'd3-selection';
import { axisBottom } from 'd3-axis';
import { format } from 'd3-format';
import { createChart, MARGIN } from './base-chart.js';
import { detectScaleType } from '../scale/detect.js';

function quantile(sorted, p) {
  const i = Math.max(0, Math.min(sorted.length - 1, p * (sorted.length - 1)));
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (i - lo) * (sorted[hi] - sorted[lo]);
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

export function createAdaptiveChart(points, { width = 900, height = 260, window = 0.5, xFormat = '~s', mode, ...options } = {}) {
  if (!points?.length) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const resolvedMode = mode ?? detectScaleType(points.map(d => d.x));

  return resolvedMode === 'log'
    ? renderLog(points, { width, height, xFormat, ...options })
    : renderPiecewise(points, { width, height, window, xFormat, ...options });
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

function renderPiecewise(points, { width, height, window, xFormat, ...options }) {
  const xFmt = makeFmt(xFormat);
  const innerW = width  - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top  - MARGIN.bottom;
  const [xMin, xMax] = extent(points, d => d.x);

  const sortedX = [...points.map(d => d.x)].sort((a, b) => a - b);

  const xLo = Math.max(xMin + (xMax - xMin) * 0.001,
                       quantile(sortedX, Math.max(0, 0.5 - window / 2)));
  const xHi = Math.min(xMax - (xMax - xMin) * 0.001,
                       quantile(sortedX, Math.min(1, 0.5 + window / 2)));

  const qLo = Math.max(0, 0.5 - window / 2);
  const qHi = Math.min(1, 0.5 + window / 2);

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
  const linearDomainWidth = xHi - xLo;

  const drawTick = px => g.append('line')
    .attr('x1', px).attr('x2', px)
    .attr('y1', 0).attr('y2', innerH)
    .attr('stroke', 'white').attr('stroke-opacity', 0.25)
    .attr('stroke-width', 1).attr('pointer-events', 'none');

  let leftCursor = xLo - linearDomainWidth;
  while (leftCursor > xMin) {
    const px = xScale(leftCursor);
    if (r1 - px < 1) break;
    drawTick(px);
    leftCursor -= linearDomainWidth;
  }

  let rightCursor = xHi + linearDomainWidth;
  while (rightCursor < xMax) {
    const px = xScale(rightCursor);
    if (px - r2 < 1) break;
    drawTick(px);
    rightCursor += linearDomainWidth;
  }

  return node;
}
