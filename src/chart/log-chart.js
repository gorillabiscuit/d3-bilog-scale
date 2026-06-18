import { scaleLog } from 'd3-scale';
import { extent } from 'd3-array';
import { createChart, MARGIN } from './base-chart.js';

export function createLogChart(points, { width = 900, ...options } = {}) {
  const safe = points?.filter(d => d.x > 0 && Number.isFinite(d.x));
  if (!safe?.length) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const innerW = width - MARGIN.left - MARGIN.right;
  const [xMin, xMax] = extent(safe, d => d.x);

  const xScale = scaleLog()
    .domain([xMin, xMax]).nice()
    .range([0, innerW]);

  return createChart(safe, xScale, { width, ...options });
}
