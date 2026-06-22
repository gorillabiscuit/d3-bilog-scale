import { quantileSorted } from 'd3-array';

/**
 * Quantile-based strategy for finding the "linear window" boundaries (xLo, xHi).
 *
 * The slider value (0–1) is a universal "tightness" parameter:
 *   0 = narrowest window (median), 1 = widest window (full data scope).
 *
 * @param {number[]} values
 * @param {number} slider
 * @returns {{xLo: number, xHi: number}}
 */
export function windowQuantile(values, slider) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    xLo: quantileSorted(sorted, Math.max(0, 0.5 - slider / 2)),
    xHi: quantileSorted(sorted, Math.min(1, 0.5 + slider / 2)),
  };
}
