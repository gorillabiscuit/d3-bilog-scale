import { describe, test, expect } from 'vitest';
import { scaleAdaptive, symlogTail } from '../src/scale/adaptive-scale.js';

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

  test('windowBounds() insets multi-decade data so interaction can never flatten a tail', () => {
    const wide = scaleAdaptive().data(bothTails).range([0, 800]);
    const [xMin, xMax] = wide.domain();
    const [lo, hi] = wide.windowBounds();
    expect(lo).toBeGreaterThan(xMin);   // cap sits inside the extremes...
    expect(hi).toBeLessThan(xMax);      // ...so the window can never reach an edge and vanish a tail

    // Compact (non-multi-decade) data has no tails to protect, so the cap is the full domain.
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

describe('focus travel (uncapped, via focusDomain)', () => {
  // The "travel onto a log section" gesture: focusDomain places the linear window EXACTLY on a
  // range even past the windowCap bound, so whichever data was in that section fills the linear
  // region and the previously-focused data becomes a log tail.
  test('reaches a range the windowCap would otherwise pull in', () => {
    const focused = makeScale().focusDomain([500, 5000]); // window runs up to the extreme
    expect(focused.linearDomain()[0]).toBeCloseTo(500, 3);
    expect(focused.linearDomain()[1]).toBeCloseTo(5000, 3);

    // The same request through the capped path is shifted well inside the requested range.
    const capped = makeScale().linearDomain([500, 5000]);
    expect(capped.linearDomain()[1]).toBeLessThan(4500);
    expect(capped.linearDomain()[0]).toBeLessThan(100);
  });

  test('focusing the right outliers turns everything below into a leading log region', () => {
    const s = makeScale().focusDomain([500, 5000]);
    const regions = s.regions();
    expect(regions[0].type).toBe('log');
    expect(regions[0].domain[0]).toBeCloseTo(s.domain()[0], 3);
    expect(regions[0].domain[1]).toBeCloseTo(500, 3);
    const linear = regions.find((r) => r.type === 'linear');
    expect(linear.domain[0]).toBeCloseTo(500, 3);
    expect(linear.domain[1]).toBeCloseTo(5000, 3);
  });

  test('monotonicity holds across 1000 values under focus', () => {
    const s = makeScale().focusDomain([500, 5000]);
    const [dMin, dMax] = s.domain();
    const step = (dMax - dMin) / 1000;
    for (let v = dMin; v < dMax - step; v += step) {
      expect(s(v)).toBeLessThan(s(v + step));
    }
  });

  test('invert(scale(v)) ≈ v under focus', () => {
    const s = makeScale().focusDomain([500, 5000]);
    const [dMin, dMax] = s.domain();
    const testValues = Array.from({ length: 50 }, (_, i) => dMin + (i / 49) * (dMax - dMin));
    for (const v of testValues) {
      const relErr = Math.abs(s.invert(s(v)) - v) / (Math.abs(v) + 1e-10);
      expect(relErr).toBeLessThan(1e-6);
    }
  });

  test('boundary pixel is continuous from both sides under focus', () => {
    const s = makeScale().focusDomain([500, 5000]);
    const b = 500; // the linear / left-tail boundary
    expect(Math.abs(s(b) - s(b - 1e-6))).toBeLessThan(0.5);
    expect(Math.abs(s(b + 1e-6) - s(b))).toBeLessThan(0.5);
  });

  test('a later linearDomain() re-enables the cap — focus is not sticky', () => {
    const s = makeScale().focusDomain([500, 5000]);
    expect(s.linearDomain()[1]).toBeCloseTo(5000, 3); // uncapped while focused
    s.linearDomain([500, 5000]);                      // back on the capped path (pan/drag)
    const [, ceil] = s.windowBounds();
    expect(s.linearDomain()[1]).toBeLessThanOrEqual(ceil + 1e-6);
    expect(s.linearDomain()[1]).toBeLessThan(5000);
  });

  test('focusDomain(null) restores the auto window', () => {
    const s = makeScale();
    const [aLo, aHi] = s.linearDomain();
    s.focusDomain([500, 5000]);
    s.focusDomain(null);
    expect(s.linearDomain()[0]).toBeCloseTo(aLo, 3);
    expect(s.linearDomain()[1]).toBeCloseTo(aHi, 3);
  });

  test('copy() preserves an uncapped focus', () => {
    const s = makeScale().focusDomain([500, 5000]);
    const c = s.copy();
    expect(c.linearDomain()[0]).toBeCloseTo(500, 3);
    expect(c.linearDomain()[1]).toBeCloseTo(5000, 3);
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

  test('copy() preserves a custom domain set after data()', () => {
    // data() derives _domain from the data's extent; a domain() call afterward overrides it.
    // copy() must replay data() before domain() internally or the override is lost on the clone.
    const s = scaleAdaptive()
      .data([1, 2, 3, 4, 5, 100])
      .domain([0, 200])
      .range([0, 800]);
    const c = s.copy();
    expect(c.domain()).toEqual([0, 200]);
    expect(c(150)).toBeCloseTo(s(150), 6);
  });

  test('clamp(true) prevents extrapolation', () => {
    const s = makeScale().clamp(true);
    const [dMin, dMax] = s.domain();
    expect(s(dMin - 100)).toBeCloseTo(s(dMin), 1);
    expect(s(dMax + 1000)).toBeCloseTo(s(dMax), 1);
  });
});

describe('ticks()', () => {
  test('honours the requested count instead of a fixed pixel gate', () => {
    const s = makeScale();
    // A wider range at the same count should not silently produce more ticks — the caller's
    // count is what governs density now, not a hardcoded pixel threshold.
    const narrow = scaleAdaptive().data(bothTails).range([0, 400]).ticks(6);
    const wide = scaleAdaptive().data(bothTails).range([0, 4000]).ticks(6);
    expect(wide.length).toBeCloseTo(narrow.length, 0);
  });

  test('produces tick candidates in the negative tail on zero-crossing data', () => {
    const s = scaleAdaptive().data([-500, -100, -10, -1, 1, 10, 100, 500]).range([0, 800]);
    const ticks = s.ticks(8);
    expect(ticks.some((v) => v < 0)).toBe(true);
    expect(ticks.some((v) => v > 0)).toBe(true);
  });

  test('produces ticks across an all-negative domain', () => {
    const s = scaleAdaptive().data([-1000, -500, -100, -50, -10, -5, -1]).range([0, 800]);
    const ticks = s.ticks(6);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((v) => v <= 0)).toBe(true);
  });

  test('domain minimum is offered as a tick candidate', () => {
    const s = scaleAdaptive().data([1, 5, 10, 50, 100, 5000]).range([0, 800]);
    const [xMin] = s.domain();
    // Not guaranteed to survive MIN_TICK_PX spacing, but it must be in the candidate pool —
    // spread the range wide enough that it isn't crowded out.
    const wide = scaleAdaptive().data([1, 5, 10, 50, 100, 5000]).range([0, 3000]);
    expect(wide.ticks(20)).toContain(xMin);
  });
});

describe('symlogTail()', () => {
  test('domain()/range() setter forms throw instead of silently no-op-ing', () => {
    const tail = symlogTail(100, 1000, 0, 200, 1);
    expect(() => tail.domain([0, 1])).toThrow();
    expect(() => tail.range([0, 1])).toThrow();
    // Getter form still works
    expect(tail.domain()).toEqual([100, 1000]);
    expect(tail.range()).toEqual([0, 200]);
  });
});
