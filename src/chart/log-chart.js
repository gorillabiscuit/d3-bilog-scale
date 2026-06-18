import { scaleLog } from 'd3-scale';
import { min, max } from 'd3-array';
import { renderChart } from './base-chart.js';

export function createLogChart(container, points, options = {}) {
  if (!points || points.length === 0) return;

  // Log scale requires strictly positive values
  const positivePoints = points.filter((d) => d.x > 0);
  if (positivePoints.length === 0) return;

  const xMin = min(positivePoints, (d) => d.x);
  const xMax = max(positivePoints, (d) => d.x);
  const width = container.clientWidth || 800;
  const innerW = width - 56 - 24;

  const xScale = scaleLog()
    .domain([xMin, xMax])
    .range([0, innerW])
    .nice();

  renderChart(container, positivePoints, xScale, options);
}
