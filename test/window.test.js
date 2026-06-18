import { describe, it, expect } from 'vitest';
import { windowQuantile, windowKDE, windowMixture } from '../src/scale/window.js';

// Representative dataset shapes drawn from the five real datasets:
// - narrow: SBA-like, clustered 0–150k with a few outliers to 5M
// - wide:   USGS-like, 5 orders of magnitude (1 to 250M)
// - bimodal: NYC-like, two populations separated by decades

function make(values) {
  return values.map(x => ({ x }));
}

const NARROW = make([
  ...Array.from({ length: 80 }, (_, i) => 5000 + i * 1500),  // cluster 5k–125k
  150000, 150000, 150000, 150000, 150000,                      // popular round number
  500000, 750000, 1200000, 2500000, 5000000,                   // outliers
]);

const WIDE = make([
  // USGS-shaped: energy 1 to 250M, heavily right-skewed
  ...Array.from({ length: 400 }, (_, i) => Math.pow(10, 1.5 * (1 + i / 100))),
  1e8, 2.5e8,
]);

const BIMODAL = make([
  // NYC-shaped: $10 deed transfers + residential cluster + trophy sales
  10, 10, 100, 200,
  ...Array.from({ length: 40 }, (_, i) => 400000 + i * 50000),  // $400k–$2.4M cluster
  50000000, 100000000, 180000000,
]);

const SLIDERS = [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1.0];
const METHODS = { windowQuantile, windowKDE, windowMixture };

// ── Core invariant: xLo < xHi for slider > 0; xLo <= xHi for slider = 0 ──────
// slider=0 is legitimately degenerate (window collapses to a single point —
// the median / density peak / cluster centre). renderPiecewise falls back to
// renderLog in that case. All other slider values must produce a strict window.

for (const [methodName, method] of Object.entries(METHODS)) {
  describe(`${methodName} — xLo ≤ xHi invariant`, () => {
    for (const [dataName, data] of Object.entries({ NARROW, WIDE, BIMODAL })) {
      const values = data.map(d => d.x);
      for (const slider of SLIDERS) {
        it(`${dataName} slider=${slider}`, () => {
          const { xLo, xHi } = method(values, slider);
          if (slider === 0) {
            expect(xLo).toBeLessThanOrEqual(xHi);
          } else {
            expect(xLo).toBeLessThan(xHi);
          }
        });
      }
    }
  });
}

// ── Monotonicity: wider slider → wider or equal window ───────────────────────
// (only reliable for quantile; kde/mixture are density-based so we skip them)

describe('windowQuantile — wider slider → wider window', () => {
  for (const [dataName, data] of Object.entries({ NARROW, WIDE, BIMODAL })) {
    const values = data.map(d => d.x);
    it(dataName, () => {
      for (let i = 0; i < SLIDERS.length - 1; i++) {
        const a = windowQuantile(values, SLIDERS[i]);
        const b = windowQuantile(values, SLIDERS[i + 1]);
        expect(b.xLo).toBeLessThanOrEqual(a.xLo + 1e-9);
        expect(b.xHi).toBeGreaterThanOrEqual(a.xHi - 1e-9);
      }
    });
  }
});

// ── Bounds: window must stay within the data range ───────────────────────────
// Quantile is always bounded by definition.
// KDE and Mixture are now clamped to [xMin, xMax] in their implementations.

for (const [methodName, method] of Object.entries(METHODS)) {
  describe(`${methodName} — window within data range`, () => {
    for (const [dataName, data] of Object.entries({ NARROW, WIDE, BIMODAL })) {
      const values = data.map(d => d.x);
      const xMin = Math.min(...values);
      const xMax = Math.max(...values);
      it(dataName, () => {
        for (const slider of SLIDERS) {
          const { xLo, xHi } = method(values, slider);
          expect(xLo).toBeGreaterThanOrEqual(xMin - 1e-9);
          expect(xHi).toBeLessThanOrEqual(xMax + 1e-9);
        }
      });
    }
  });
}

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('single unique value does not crash', () => {
    const values = [42, 42, 42, 42];
    for (const method of Object.values(METHODS)) {
      expect(() => method(values, 0.5)).not.toThrow();
    }
  });

  it('two values does not crash', () => {
    const values = [1, 1000000];
    for (const method of Object.values(METHODS)) {
      expect(() => method(values, 0.5)).not.toThrow();
    }
  });

  it('extreme range 1 to 250M (USGS shape) — quantile always valid', () => {
    const values = Array.from({ length: 500 },
      (_, i) => Math.pow(10, 1.5 * (1 + i / 70)));
    for (const slider of SLIDERS) {
      const { xLo, xHi } = windowQuantile(values, slider);
      if (slider === 0) {
        expect(xLo).toBeLessThanOrEqual(xHi);
      } else {
        expect(xLo).toBeLessThan(xHi);
      }
    }
  });
});
