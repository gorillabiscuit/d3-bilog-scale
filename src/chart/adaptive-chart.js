import { scalePow, scaleLinear } from 'd3-scale';
import { extent } from 'd3-array';
import { select } from 'd3-selection';
import { createChart, MARGIN } from './base-chart.js';

function quantile(sorted, p) {
  const i = Math.max(0, Math.min(sorted.length - 1, p * (sorted.length - 1)));
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (i - lo) * (sorted[hi] - sorted[lo]);
}

export function createAdaptiveChart(points, { width = 900, height = 260, window = 0.5, ...options } = {}) {
  if (!points?.length) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const innerW = width  - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top  - MARGIN.bottom;
  const [xMin, xMax] = extent(points, d => d.x);

  const sortedX = [...points.map(d => d.x)].sort((a, b) => a - b);

  // Clamp so neither boundary collapses onto the domain edge
  const xLo = Math.max(xMin + (xMax - xMin) * 0.001,
                       quantile(sortedX, Math.max(0, 0.5 - window / 2)));
  const xHi = Math.min(xMax - (xMax - xMin) * 0.001,
                       quantile(sortedX, Math.min(1, 0.5 + window / 2)));

  // Pixel boundaries derived directly from the quantile fractions — continuous,
  // so the boundary slides smoothly as the slider moves rather than jumping
  // each time a data point crosses the threshold.
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
    const tl = qLo > 0    ? leftScale.ticks(Math.max(1, Math.round(count * qLo)))          : [];
    const tm =               midScale.ticks(Math.max(1, Math.round(count * (qHi - qLo))))  ;
    const tr = qHi < 1    ? rightScale.ticks(Math.max(1, Math.round(count * (1 - qHi))))   : [];
    return [...tl, ...tm, ...tr];
  };

  const node = createChart(points, xScale, { width, height, ...options });

  const g = select(node).select('g');

  // White overlay on the linear region — lowered behind dots
  g.append('rect')
      .attr('x', r1)
      .attr('width', Math.max(0, r2 - r1))
      .attr('y', 0)
      .attr('height', innerH)
      .attr('fill', 'white')
      .attr('fill-opacity', 0.07)
      .attr('pointer-events', 'none')
    .lower();

  // Reference boxes: same domain width as the linear section, tiled across each
  // tail. Because the tails are power-compressed, each successive box is narrower
  // in pixels even though it spans the same domain distance — that shrinkage is
  // the compression made visible.
  const linearDomainWidth = xHi - xLo;
  const refH = innerH * 0.2;
  const refY = innerH - refH;

  const drawRef = (x0px, widthPx) => g.append('rect')
    .attr('x', x0px)
    .attr('width', Math.max(0, widthPx))
    .attr('y', refY)
    .attr('height', refH)
    .attr('fill', 'white')
    .attr('fill-opacity', 0.08)
    .attr('stroke', 'white')
    .attr('stroke-opacity', 0.35)
    .attr('stroke-width', 1)
    .attr('pointer-events', 'none');

  // Left tail: step leftward from xLo in linear-section-width increments
  let leftCursor = xLo;
  while (leftCursor > xMin) {
    const next = Math.max(xMin, leftCursor - linearDomainWidth);
    const px0 = xScale(next);
    const px1 = xScale(leftCursor);
    if (px1 - px0 < 1) break;
    drawRef(px0, px1 - px0);
    leftCursor = next;
  }

  // Right tail: step rightward from xHi in linear-section-width increments
  let rightCursor = xHi;
  while (rightCursor < xMax) {
    const next = Math.min(xMax, rightCursor + linearDomainWidth);
    const px0 = xScale(rightCursor);
    const px1 = xScale(next);
    if (px1 - px0 < 1) break;
    drawRef(px0, px1 - px0);
    rightCursor = next;
  }

  return node;
}
