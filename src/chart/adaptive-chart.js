import { min, max } from 'd3-array';
import { scaleAdaptive } from '../scale/adaptive-scale.js';
import { renderChart } from './base-chart.js';

export function createAdaptiveChart(container, points, options = {}) {
  if (!points || points.length === 0) return;

  const width = container.clientWidth || 800;
  const innerW = width - 56 - 24;

  const xValues = points.map((d) => d.x).filter((v) => v > 0 && Number.isFinite(v));

  const xScale = scaleAdaptive()
    .data(xValues)
    .range([0, innerW]);

  // Wrap xScale so its output is offset correctly in renderChart
  // (base-chart subtracts MARGIN.left from cx, so xScale must return absolute pixel)
  const wrappedScale = (v) => xScale(v > 0 ? v : 1e-10) + 56; // add MARGIN.left back
  wrappedScale.ticks = () => xScale.ticks();
  wrappedScale.tickFormat = () => xScale.tickFormat();
  wrappedScale.domain = xScale.domain;
  wrappedScale.range = () => [56, innerW + 56];

  const regionMarkers = xScale.regions().filter((r) => r.type === 'log');

  const safePoints = points.filter((d) => d.x > 0 && Number.isFinite(d.x));

  renderChart(container, safePoints, wrappedScale, { ...options, regionMarkers });
}
