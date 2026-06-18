import { scaleLinear } from 'd3-scale';
import { min, max } from 'd3-array';
import { renderChart, MARGIN } from './base-chart.js';

export function createLinearChart(container, points, options = {}) {
  if (!points || points.length === 0) return;

  const width = container.clientWidth || 800;
  const innerW = width - MARGIN.left - MARGIN.right;

  const xMin = min(points, (d) => d.x);
  const xMax = max(points, (d) => d.x);

  const xScale = scaleLinear()
    .domain([xMin, xMax])
    .range([0, innerW])
    .nice();

  renderChart(container, points, xScale, options);
}
