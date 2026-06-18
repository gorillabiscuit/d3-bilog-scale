/**
 * Detects whether a dataset is better described as log-normal (use a log scale
 * end-to-end) or as a linear cluster with extreme outliers (use piecewise).
 *
 * Signal: skewness. Log-normal data has high raw skewness that collapses near
 * zero after a log transform. Clustered-outlier data stays skewed in log space
 * because the outliers are genuine extremes in both directions, not part of a
 * coherent log-normal family.
 */

function skewness(values) {
  const n = values.length;
  if (n < 3) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  if (variance === 0) return 0;
  const std = Math.sqrt(variance);
  return values.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n;
}

/**
 * Returns 'log' if the data is log-normally distributed, 'piecewise' otherwise.
 *
 * Criteria for 'log':
 *   - The log transform reduces |skewness| by at least 3×
 *   - AND the residual log-skewness is below 1.5 (roughly symmetric in log space)
 *
 * @param {number[]} values  Raw positive x-values
 * @returns {'log' | 'piecewise'}
 */
export function detectScaleType(values) {
  const positive = values.filter(v => v > 0 && Number.isFinite(v));
  if (positive.length < 10) return 'piecewise';

  const rawSkew = Math.abs(skewness(positive));
  const logSkew = Math.abs(skewness(positive.map(v => Math.log(v))));

  const logReducesSkew = logSkew < rawSkew / 3;
  const logIsSymmetric = logSkew < 1.5;

  return logReducesSkew && logIsSymmetric ? 'log' : 'piecewise';
}
