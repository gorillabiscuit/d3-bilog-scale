import { scaleAdaptive } from '../scale/adaptive-scale.js';
import { renderChart, MARGIN } from './base-chart.js';

export function createAdaptiveChart(container, points, options = {}) {
  if (!points || points.length === 0) return;

  const width = container.clientWidth || 800;
  const innerW = width - MARGIN.left - MARGIN.right;

  const safePoints = points.filter((d) => d.x > 0 && Number.isFinite(d.x) && Number.isFinite(d.y));
  if (safePoints.length === 0) return;

  const xValues = safePoints.map((d) => d.x);

  const xScale = scaleAdaptive()
    .data(xValues)
    .range([0, innerW])
    .breakpointMethod(options.method || 'iqr');

  renderChart(container, safePoints, xScale, {
    ...options,
    regions: xScale.regions(),
  });
}
