import { scaleAdaptive } from '../scale/adaptive-scale.js';
import { createChart, MARGIN } from './base-chart.js';

export function createAdaptiveChart(points, { width = 900, method = 'iqr', ...options } = {}) {
  const safe = points?.filter(d => d.x > 0 && Number.isFinite(d.x) && Number.isFinite(d.y));
  if (!safe?.length) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const innerW = width - MARGIN.left - MARGIN.right;

  const xScale = scaleAdaptive()
    .data(safe.map(d => d.x))
    .range([0, innerW])
    .breakpointMethod(method);

  return createChart(safe, xScale, {
    width,
    ...options,
    regions:       xScale.regions(),
    showGridlines: true,
  });
}
