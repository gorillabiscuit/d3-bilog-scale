import { describe, test } from 'vitest';
import { detectBreakpoints } from '../src/scale/breakpoints.js';
import { generateBothTails, generateBaseline } from '../src/data/generators.js';

describe('IQR method', () => {
  test.todo('returns leftBreakpoint and rightBreakpoint');
  test.todo('leftBreakpoint = Q1 - 1.5*IQR, clamped to dMin');
  test.todo('rightBreakpoint = Q3 + 1.5*IQR, clamped to dMax');
  test.todo('with no outliers: leftBreakpoint ≈ dMin and rightBreakpoint ≈ dMax');
  test.todo('outliers below bL are classified as left-tail points');
  test.todo('outliers above bR are classified as right-tail points');
});

describe('percentile method', () => {
  test.todo('uses P10 and P90 by default');
  test.todo('accepts custom percentile parameter');
  test.todo('bL = P10, bR = P90 of the input data');
});

describe('empty and degenerate data', () => {
  test.todo('throws or returns sensible defaults for empty array');
  test.todo('handles array with a single value');
  test.todo('handles array with two identical values');
});

describe('single cluster (no outliers)', () => {
  test.todo('IQR method: bL === dMin when no low outliers exist');
  test.todo('IQR method: bR === dMax when no high outliers exist');
  test.todo('scale should be instructed to omit log tails in this case');
});
