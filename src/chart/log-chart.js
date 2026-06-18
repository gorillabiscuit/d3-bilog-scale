import { scaleLog } from 'd3-scale';
import { min, max } from 'd3-array';
import { renderChart, MARGIN } from './base-chart.js';

export function createLogChart(container, points, options = {}) {
  if (!points || points.length === 0) return;

  const width = container.clientWidth || 800;
  const innerW = width - MARGIN.left - MARGIN.right;

  const positivePoints = points.filter((d) => d.x > 0 && Number.isFinite(d.x));
  if (positivePoints.length === 0) return;

  const xMin = min(positivePoints, (d) => d.x);
  const xMax = max(positivePoints, (d) => d.x);

  const xScale = scaleLog()
    .domain([xMin, xMax])
    .range([0, innerW])
    .nice();

  renderChart(container, positivePoints, xScale, options);
}
