import { quantile, min, max } from 'd3-array';

/**
 * Detect the boundary between the dense cluster and the outlier tails.
 * Returns { left, right } — values that define the three regions.
 * If left === domain min, there is no left tail (region collapses to zero width).
 * If right === domain max, there is no right tail.
 */
export function detectBreakpoints(data, method = 'iqr') {
  if (!data || data.length < 2) {
    return { left: min(data) ?? 0, right: max(data) ?? 1 };
  }

  const sorted = [...data].filter(Number.isFinite).sort((a, b) => a - b);
  const dMin = sorted[0];
  const dMax = sorted[sorted.length - 1];

  if (dMin === dMax) return { left: dMin, right: dMax };

  if (method === 'iqr') {
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const left = Math.max(q1 - 1.5 * iqr, dMin);
    const right = Math.min(q3 + 1.5 * iqr, dMax);
    return { left, right };
  }

  if (method === 'percentile') {
    const left = quantile(sorted, 0.10);
    const right = quantile(sorted, 0.90);
    return { left, right };
  }

  throw new Error(`Unknown breakpoint method: ${method}`);
}
