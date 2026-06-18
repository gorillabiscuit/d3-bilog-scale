/**
 * Detect breakpoints between the dense cluster and outlier tails.
 * @param {number[]} data - raw numeric values
 * @param {'iqr'|'percentile'|'density'|'jenks'} method
 * @returns {{ leftBreakpoint: number, rightBreakpoint: number }}
 */
export function detectBreakpoints(data, method = 'iqr') {
  // TODO: implement IQR, percentile, density, jenks methods
  throw new Error('Not implemented');
}
