// Mulberry32 seeded PRNG — reproducible datasets across runs
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normal distribution via Box-Muller, using the provided PRNG
function gaussianFactory(rand) {
  return function (mean, std) {
    const u1 = rand();
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  };
}

// Uniform [lo, hi] using the provided PRNG
function uniformFactory(rand) {
  return (lo, hi) => lo + rand() * (hi - lo);
}

/**
 * Baseline: dense cluster only, 40–80% LTV, 8–25% APR. No outliers.
 * Scale should degrade to near-linear when called with this dataset.
 */
export function generateBaseline(n = 200, seed = 1) {
  const rand = mulberry32(seed);
  const gaussian = gaussianFactory(rand);
  const results = [];
  for (let i = 0; i < n; i++) {
    const ltv = Math.max(40, Math.min(80, gaussian(60, 8)));
    const apr = Math.max(8, Math.min(25, gaussian(14, 3)));
    results.push({ ltv, apr });
  }
  return results;
}

/**
 * Left-skewed: cluster at 40–80% LTV plus ~20 low outliers at 2–35% LTV.
 * Low LTV → overcollateralised → higher APR (unusual risk for lender).
 */
export function generateLeftSkew(n = 200, seed = 2) {
  const rand = mulberry32(seed);
  const gaussian = gaussianFactory(rand);
  const uniform = uniformFactory(rand);
  const results = [];
  const outlierCount = 20;
  for (let i = 0; i < n - outlierCount; i++) {
    const ltv = Math.max(40, Math.min(80, gaussian(60, 8)));
    const apr = Math.max(8, Math.min(25, gaussian(14, 3)));
    results.push({ ltv, apr });
  }
  for (let i = 0; i < outlierCount; i++) {
    const ltv = uniform(2, 35);
    // Overcollateralised loans command a slight premium in niche markets
    const apr = uniform(18, 30);
    results.push({ ltv, apr });
  }
  return results;
}

/**
 * Right-skewed: cluster at 40–80% LTV plus ~20 high outliers at 100–5000% LTV.
 * High LTV → undercollateralised → varied APR depending on borrower profile.
 */
export function generateRightSkew(n = 200, seed = 3) {
  const rand = mulberry32(seed);
  const gaussian = gaussianFactory(rand);
  const uniform = uniformFactory(rand);
  const results = [];
  const outlierCount = 20;
  for (let i = 0; i < n - outlierCount; i++) {
    const ltv = Math.max(40, Math.min(80, gaussian(60, 8)));
    const apr = Math.max(8, Math.min(25, gaussian(14, 3)));
    results.push({ ltv, apr });
  }
  for (let i = 0; i < outlierCount; i++) {
    // Log-uniform distribution gives realistic spread across orders of magnitude
    const logLtv = uniform(Math.log(100), Math.log(5000));
    const ltv = Math.exp(logLtv);
    const apr = uniform(5, 40);
    results.push({ ltv, apr });
  }
  return results;
}

/**
 * Both tails: the canonical case — cluster at 40–80% LTV,
 * plus ~15 low outliers (2–35%) and ~20 high outliers (100–5000%).
 */
export function generateBothTails(n = 200, seed = 4) {
  const rand = mulberry32(seed);
  const gaussian = gaussianFactory(rand);
  const uniform = uniformFactory(rand);
  const results = [];
  const leftOutlierCount = 15;
  const rightOutlierCount = 20;
  const clusterCount = n - leftOutlierCount - rightOutlierCount;

  for (let i = 0; i < clusterCount; i++) {
    const ltv = Math.max(40, Math.min(80, gaussian(60, 8)));
    const apr = Math.max(8, Math.min(25, gaussian(14, 3)));
    results.push({ ltv, apr });
  }
  for (let i = 0; i < leftOutlierCount; i++) {
    const ltv = uniform(2, 35);
    const apr = uniform(18, 30);
    results.push({ ltv, apr });
  }
  for (let i = 0; i < rightOutlierCount; i++) {
    const logLtv = uniform(Math.log(100), Math.log(5000));
    const ltv = Math.exp(logLtv);
    const apr = uniform(5, 40);
    results.push({ ltv, apr });
  }
  return results;
}

/**
 * Extreme stress test: tight cluster at 55–65% LTV, outliers spanning
 * 0.5%–50,000% LTV. Maximum dynamic range — tests scale robustness.
 */
export function generateExtreme(n = 200, seed = 5) {
  const rand = mulberry32(seed);
  const gaussian = gaussianFactory(rand);
  const uniform = uniformFactory(rand);
  const results = [];
  const leftOutlierCount = 15;
  const rightOutlierCount = 25;
  const clusterCount = n - leftOutlierCount - rightOutlierCount;

  for (let i = 0; i < clusterCount; i++) {
    const ltv = Math.max(55, Math.min(65, gaussian(60, 2)));
    const apr = Math.max(8, Math.min(25, gaussian(14, 3)));
    results.push({ ltv, apr });
  }
  for (let i = 0; i < leftOutlierCount; i++) {
    const logLtv = uniform(Math.log(0.5), Math.log(50));
    const ltv = Math.exp(logLtv);
    const apr = uniform(20, 40);
    results.push({ ltv, apr });
  }
  for (let i = 0; i < rightOutlierCount; i++) {
    const logLtv = uniform(Math.log(100), Math.log(50000));
    const ltv = Math.exp(logLtv);
    const apr = uniform(5, 45);
    results.push({ ltv, apr });
  }
  return results;
}
