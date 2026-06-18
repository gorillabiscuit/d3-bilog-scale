/**
 * Three strategies for finding the "linear window" boundaries (xLo, xHi).
 * Each returns { xLo, xHi } in the original domain.
 *
 * The slider value (0–1) is a universal "tightness" parameter:
 *   0 = narrowest window, 1 = widest window.
 * Each method maps it to its own natural parameter space internally.
 */

function quantile(sorted, p) {
  const i = Math.max(0, Math.min(sorted.length - 1, p * (sorted.length - 1)));
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (i - lo) * (sorted[hi] - sorted[lo]);
}

function mean(values) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function std(values, mu) {
  const m = mu ?? mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

// ── Quantile ──────────────────────────────────────────────────────────────────
// slider controls what fraction of the data (by count) falls in the window.

export function windowQuantile(values, slider) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    xLo: quantile(sorted, Math.max(0, 0.5 - slider / 2)),
    xHi: quantile(sorted, Math.min(1, 0.5 + slider / 2)),
  };
}

// ── KDE (Kernel Density Estimation) ──────────────────────────────────────────
// Works in log-space. Finds the density peak, then sets the window as
// k bandwidths either side of the peak.
// slider maps to k in [0, 4] bandwidths.

export function windowKDE(values, slider) {
  const logVals = values.filter(v => v > 0).map(v => Math.log(v));
  const n = logVals.length;
  const mu = mean(logVals);
  const sigma = std(logVals, mu);

  // Silverman's rule of thumb
  const h = 1.06 * sigma * Math.pow(n, -0.2);

  const lo = Math.min(...logVals);
  const hi = Math.max(...logVals);
  const GRID = 300;
  let peakLog = mu, peakDensity = -Infinity;

  for (let i = 0; i <= GRID; i++) {
    const x = lo + (hi - lo) * (i / GRID);
    const density = logVals.reduce(
      (s, v) => s + Math.exp(-0.5 * ((x - v) / h) ** 2), 0
    );
    if (density > peakDensity) { peakDensity = density; peakLog = x; }
  }

  const k = slider * 4;
  const positive = values.filter(v => v > 0);
  const xMin = Math.min(...positive);
  const xMax = Math.max(...positive);
  return {
    xLo: Math.max(xMin, Math.exp(peakLog - k * h)),
    xHi: Math.min(xMax, Math.exp(peakLog + k * h)),
  };
}

// ── Mixture model (EM) ────────────────────────────────────────────────────────
// Fits a 2-component Gaussian mixture in log-space. The tighter component
// (smaller σ) is assumed to be the "cluster". The window is k std-devs wide.
// slider maps to k in [0, 4] standard deviations.

export function windowMixture(values, slider) {
  const logVals = values.filter(v => v > 0).map(v => Math.log(v));
  const n = logVals.length;
  const sorted = [...logVals].sort((a, b) => a - b);

  // Initialise: two components at the 25th and 75th percentile
  let mu1 = quantile(sorted, 0.25);
  let mu2 = quantile(sorted, 0.75);
  let s1  = std(logVals) * 0.5;
  let s2  = std(logVals) * 1.0;
  let pi1 = 0.5;

  const gauss = (x, mu, s) =>
    Math.exp(-0.5 * ((x - mu) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

  for (let iter = 0; iter < 40; iter++) {
    // E-step: responsibility of component 1 for each point
    const r = logVals.map(x => {
      const p1 =      pi1  * gauss(x, mu1, s1);
      const p2 = (1 - pi1) * gauss(x, mu2, s2);
      const denom = p1 + p2;
      return denom < 1e-300 ? 0.5 : p1 / denom;
    });

    // M-step
    const R1 = r.reduce((s, v) => s + v, 0);
    const R2 = n - R1;

    if (R1 < 1 || R2 < 1) break;

    pi1 = R1 / n;
    mu1 = r.reduce((s, ri, i) => s + ri * logVals[i], 0) / R1;
    mu2 = r.reduce((s, ri, i) => s + (1 - ri) * logVals[i], 0) / R2;
    s1  = Math.max(0.01, Math.sqrt(r.reduce((s, ri, i) => s + ri * (logVals[i] - mu1) ** 2, 0) / R1));
    s2  = Math.max(0.01, Math.sqrt(r.reduce((s, ri, i) => s + (1 - ri) * (logVals[i] - mu2) ** 2, 0) / R2));
  }

  // The cluster is the tighter component
  const [clusterMu, clusterS] = s1 <= s2 ? [mu1, s1] : [mu2, s2];

  const k = slider * 4;
  const xMin = Math.exp(sorted[0]);
  const xMax = Math.exp(sorted[sorted.length - 1]);
  return {
    xLo: Math.max(xMin, Math.exp(clusterMu - k * clusterS)),
    xHi: Math.min(xMax, Math.exp(clusterMu + k * clusterS)),
  };
}
