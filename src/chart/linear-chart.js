import { scaleLinear } from 'd3-scale';
import { extent } from 'd3-array';
import { createChart, MARGIN } from './base-chart.js';

export function createLinearChart(points, { width = 900, ...options } = {}) {
  if (!points?.length) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const innerW = width - MARGIN.left - MARGIN.right;
  const [xMin, xMax] = extent(points, d => d.x);

  const xScale = scaleLinear()
    .domain([xMin, xMax]).nice()
    .range([0, innerW]);

  return createChart(points, xScale, { width, ...options });
}
