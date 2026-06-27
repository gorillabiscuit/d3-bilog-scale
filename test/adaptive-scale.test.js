import { describe, test, expect } from 'vitest';
import { scaleAdaptive } from '../src/scale/adaptive-scale.js';

// Canonical both-tails dataset
const cluster = Array.from({ length: 160 }, (_, i) => 40 + (i / 159) * 40);
const leftOutliers = [2, 5, 8, 12, 18, 25, 30];
const rightOutliers = [200, 500, 1000, 2000, 5000];
const bothTails = [...leftOutliers, ...cluster, ...rightOutliers];

function makeScale(data = bothTails) {
  return scaleAdaptive().data(data).range([0, 800]);
}

describe('monotonicity', () => {
  test('scale(a) < scale(b) whenever a < b across 1000 evenly spaced values', () => {
    const s = makeScale();
    const [dMin, dMax] = s.domain();
    const step = (dMax - dMin) / 1000;
    for (let v = dMin; v < dMax - step; v += step) {
      expect(s(v)).toBeLessThan(s(v + step));
    }
  });

  test('monotonicity holds at the left breakpoint boundary', () => {
    const s = makeScale();
    const regions = s.regions();
    if (regions.length < 2) return;
    const bL = regions[0].domain[1];
    expect(s(bL - 0.001)).toBeLessThan(s(bL));
    expect(s(bL)).toBeLessThan(s(bL + 0.001));
  });

  test('monotonicity holds at the right breakpoint boundary', () => {
    const s = makeScale();
    const regions = s.regions();
    const last = regions[regions.length - 1];
    if (last.type !== 'log') return;
    const bR = last.domain[0];
    expect(s(bR - 0.1)).toBeLessThan(s(bR));
    expect(s(bR)).toBeLessThan(s(bR + 0.1));
  });
});

describe('invertibility', () => {
  test('invert(scale(v)) ≈ v for values across the full domain', () => {
    const s = makeScale();
    const [dMin, dMax] = s.domain();
    const testValues = Array.from({ length: 50 }, (_, i) => dMin + (i / 49) * (dMax - dMin));
    for (const v of testValues) {
      const roundTrip = s.invert(s(v));
      const relErr = Math.abs(roundTrip - v) / (Math.abs(v) + 1e-10);
      expect(relErr).toBeLessThan(1e-6);
    }
  });
});

describe('boundary continuity', () => {
  test('pixel at left breakpoint is identical from both sides', () => {
    const s = makeScale();
    const regions = s.regions();
    if (regions.length < 2) return;
    const bL = regions[0].domain[1];
    // Approach from just below and just above
    const fromLeft = s(bL - 1e-9);
    const atBoundary = s(bL);
    const fromRight = s(bL + 1e-9);
    expect(Math.abs(atBoundary - fromLeft)).toBeLessThan(0.5);
    expect(Math.abs(fromRight - atBoundary)).toBeLessThan(0.5);
  });

  test('pixel at right breakpoint is identical from both sides', () => {
    const s = makeScale();
    const regions = s.regions();
    const last = regions[regions.length - 1];
    if (last.type !== 'log') return;
    const bR = last.domain[0];
    const fromLeft = s(bR - 1e-6);
    const atBoundary = s(bR);
    const fromRight = s(bR + 1e-6);
    expect(Math.abs(atBoundary - fromLeft)).toBeLessThan(0.5);
    expect(Math.abs(fromRight - atBoundary)).toBeLessThan(0.5);
  });
});

describe('edge cases', () => {
  test('empty data: behaves like a linear scale', () => {
    const s = scaleAdaptive().domain([0, 100]).range([0, 800]);
    expect(s(0)).toBeCloseTo(0);
    expect(s(50)).toBeCloseTo(400);
    expect(s(100)).toBeCloseTo(800);
  });

  test('all identical values: does not throw', () => {
    expect(() => scaleAdaptive().data([42, 42, 42, 42]).range([0, 800])).not.toThrow();
  });

  test('returns finite values for all inputs within domain', () => {
    const s = makeScale();
    for (const v of bothTails) {
      expect(Number.isFinite(s(v))).toBe(true);
    }
  });
});

describe('graceful degradation', () => {
  test('no outliers: only one region (linear)', () => {
    const s = scaleAdaptive().data(cluster).range([0, 800]);
    const regions = s.regions();
    expect(regions.every((r) => r.type === 'linear')).toBe(true);
  });

  test('right-skewed data: has a right log region', () => {
    const s = scaleAdaptive().data([...cluster, ...rightOutliers]).range([0, 800]);
    const regions = s.regions();
    expect(regions.some((r) => r.type === 'log')).toBe(true);
  });

  test('pixel allocation sums to total range width', () => {
    const s = makeScale();
    const totalPixels = s.regions().reduce((sum, r) => sum + r.pixels, 0);
    expect(totalPixels).toBeCloseTo(800, 1);
  });
});

describe('window cap and pixel reserve', () => {
  test('tail pixel-reserve never inverts the linear region (wide chart)', () => {
    // On a 1200px chart minTail = 24px > the 20px the window is given. Reserving each tail
    // independently used to push p1 past p2, producing a negative-width linear region and
    // breaking monotonicity. (The 800px suite default never triggers it: minTail = 16 < 20.)
    const s = scaleAdaptive().data(bothTails).range([0, 1200]);
    s.linearDomain([45, 70]).linearRange([1180, 1200]); // 20px window, both tails, docked right
    const [r1, r2] = s.linearRange();
    expect(r2).toBeGreaterThan(r1);
    expect(s(50)).toBeLessThan(s(65)); // monotonic across the linear window
  });

  test('window cannot swallow the whole range on multi-decade data', () => {
    const s = scaleAdaptive().data(bothTails).range([0, 800]).breakpointMethod('quantile').window(1);
    const [xMin, xMax] = s.domain();
    const [lo, hi] = s.linearDomain();
    expect(lo).toBeGreaterThan(xMin);
    expect(hi).toBeLessThan(xMax);
    expect(s.regions().some((r) => r.type === 'log')).toBe(true);
  });

  test('window panned entirely past the ceiling keeps its width (no collapse)', () => {
    const s = scaleAdaptive().data(bothTails).range([0, 800]);
    const [, ceil] = s.windowBounds();
    s.linearDomain([ceil * 1.5, ceil * 1.5 + 500]); // both edges above the ceiling
    const [lo, hi] = s.linearDomain();
    expect(hi - lo).toBeCloseTo(500, 0);          // width preserved, not collapsed to 0
    expect(hi).toBeLessThanOrEqual(ceil + 1e-6);
  });

  test('windowBounds() exposes the full data extent (interaction can reach the edges)', () => {
    const wide = scaleAdaptive().data(bothTails).range([0, 800]);
    expect(wide.windowBounds()).toEqual(wide.domain());

    const compact = scaleAdaptive().data(cluster).range([0, 800]);
    expect(compact.windowBounds()).toEqual(compact.domain());
  });

  test('the auto window insets multi-decade data so a tail survives on each side', () => {
    const wide = scaleAdaptive().data(bothTails).range([0, 800]); // default window, no drag override
    const [lo, hi] = wide.linearDomain();
    const [xMin, xMax] = wide.domain();
    expect(lo).toBeGreaterThan(xMin);
    expect(hi).toBeLessThan(xMax);
  });
});

describe('d3 compatibility', () => {
  test('domain() getter returns current domain', () => {
    const s = makeScale();
    const d = s.domain();
    expect(d).toHaveLength(2);
    expect(d[0]).toBeLessThan(d[1]);
  });

  test('domain() setter returns scale for chaining', () => {
    const s = scaleAdaptive();
    expect(s.domain([1, 100])).toBe(s);
  });

  test('range() setter returns scale for chaining', () => {
    const s = scaleAdaptive();
    expect(s.range([0, 800])).toBe(s);
  });

  test('copy() returns an independent clone', () => {
    const s = makeScale();
    const copy = s.copy();
    expect(copy).not.toBe(s);
    expect(copy.domain()).toEqual(s.domain());
    expect(copy.range()).toEqual(s.range());
    // Mutating copy does not affect original
    copy.range([0, 400]);
    expect(s.range()).toEqual([0, 800]);
  });

  test('clamp(true) prevents extrapolation', () => {
    const s = makeScale().clamp(true);
    const [dMin, dMax] = s.domain();
    expect(s(dMin - 100)).toBeCloseTo(s(dMin), 1);
    expect(s(dMax + 1000)).toBeCloseTo(s(dMax), 1);
  });
});
