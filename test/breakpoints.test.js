import { describe, test, expect } from 'vitest';
import { detectBreakpoints } from '../src/scale/breakpoints.js';

const cluster = Array.from({ length: 160 }, (_, i) => 40 + (i / 159) * 40); // 40–80
const leftOutliers = [2, 5, 8, 12, 18, 25, 30];
const rightOutliers = [200, 500, 1000, 2000, 5000];
const bothTails = [...leftOutliers, ...cluster, ...rightOutliers];

describe('IQR method', () => {
  test('returns left and right properties', () => {
    const bp = detectBreakpoints(bothTails, 'iqr');
    expect(bp).toHaveProperty('left');
    expect(bp).toHaveProperty('right');
  });

  test('left < right', () => {
    const { left, right } = detectBreakpoints(bothTails, 'iqr');
    expect(left).toBeLessThan(right);
  });

  test('left is clamped to dMin when no low outliers exist', () => {
    const { left } = detectBreakpoints(cluster, 'iqr');
    expect(left).toBeCloseTo(cluster[0], 0);
  });

  test('right is clamped to dMax when no high outliers exist', () => {
    const { right } = detectBreakpoints(cluster, 'iqr');
    expect(right).toBeCloseTo(cluster[cluster.length - 1], 0);
  });

  test('outliers below left are outside the cluster', () => {
    const { left } = detectBreakpoints(bothTails, 'iqr');
    const outside = leftOutliers.filter((v) => v < left);
    expect(outside.length).toBeGreaterThan(0);
  });

  test('outliers above right are outside the cluster', () => {
    const { right } = detectBreakpoints(bothTails, 'iqr');
    const outside = rightOutliers.filter((v) => v > right);
    expect(outside.length).toBeGreaterThan(0);
  });
});

describe('percentile method', () => {
  test('bL = P10, bR = P90', () => {
    const data = Array.from({ length: 100 }, (_, i) => i + 1); // 1–100
    const { left, right } = detectBreakpoints(data, 'percentile');
    expect(left).toBeCloseTo(10.9, 0);
    expect(right).toBeCloseTo(90.1, 0);
  });
});

describe('empty and degenerate data', () => {
  test('empty array returns sensible defaults', () => {
    const bp = detectBreakpoints([], 'iqr');
    expect(Number.isFinite(bp.left)).toBe(true);
    expect(Number.isFinite(bp.right)).toBe(true);
  });

  test('single value: left === right === that value', () => {
    const { left, right } = detectBreakpoints([42], 'iqr');
    expect(left).toBe(42);
    expect(right).toBe(42);
  });

  test('all identical: left === right', () => {
    const { left, right } = detectBreakpoints([7, 7, 7, 7], 'iqr');
    expect(left).toBe(right);
  });
});

describe('unknown method', () => {
  test('throws for unsupported method', () => {
    expect(() => detectBreakpoints(cluster, 'nonsense')).toThrow();
  });
});
