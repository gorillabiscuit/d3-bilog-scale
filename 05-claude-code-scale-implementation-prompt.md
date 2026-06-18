# Claude Code Prompt: Implement the Adaptive Scale

Use this AFTER scaffolding is done and tests are running (even if skipped).

---

```
Read AGENTS.md first. Then read the test stubs in test/ to understand what the scale needs to satisfy.

Implement scaleAdaptive in src/scale/adaptive-scale.js and src/scale/breakpoints.js. This is the core of the project. Get the math right.

## What scaleAdaptive does

It's a D3-compatible scale that splits the domain into three regions:
- Left tail: logarithmic compression
- Middle: linear encoding
- Right tail: logarithmic compression

Breakpoints between regions are derived from the data.

## The scale factory

```js
function scaleAdaptive() {
  // Internal state
  let domain = [0, 1]
  let range = [0, 1]
  let data = []
  let breakpointMethod = 'iqr'  // 'iqr' | 'percentile' | 'density'
  let clampEnabled = false
  let allocAlpha = 0.5  // blending factor for pixel allocation

  // Derived state (recomputed when domain/range/data changes)
  let breakpoints = null    // { left: bL, right: bR }
  let regions = null        // array of { type, domain, range }
  let subScales = null      // array of d3 scales (one per region)

  function scale(v) {
    // 1. Clamp if enabled
    // 2. Determine which region v falls in
    // 3. Return the sub-scale result
  }

  // Getter/setters that trigger recomputation
  scale.domain = function(_) { ... }
  scale.range = function(_) { ... }
  scale.data = function(_) { ... }
  scale.breakpointMethod = function(_) { ... }
  scale.allocAlpha = function(_) { ... }
  scale.clamp = function(_) { ... }

  // Derived
  scale.invert = function(p) { ... }
  scale.ticks = function(count) { ... }
  scale.tickFormat = function(count, specifier) { ... }
  scale.copy = function() { ... }
  scale.regions = function() { ... }  // returns [{type, domain, range}, ...]

  return scale
}
```

## Breakpoint detection (src/scale/breakpoints.js)

Implement two methods:

### IQR-based (default)
```
Q1 = d3.quantile(sorted, 0.25)
Q3 = d3.quantile(sorted, 0.75)
IQR = Q3 - Q1
bL = Math.max(Q1 - 1.5 * IQR, d3.min(data))
bR = Math.min(Q3 + 1.5 * IQR, d3.max(data))
```

### Percentile-based
```
bL = d3.quantile(sorted, 0.10)
bR = d3.quantile(sorted, 0.90)
```

Both return { left: bL, right: bR }.

If bL === domain[0], there's no left tail (region collapses).
If bR === domain[1], there's no right tail (region collapses).

## Pixel allocation

Each region gets a proportion of the total pixel range:

```
nL = data.filter(v => v < bL).length
nM = data.filter(v => v >= bL && v <= bR).length
nR = data.filter(v => v > bR).length
n = data.length

baseAlloc = 1/3
pL = alpha * baseAlloc + (1 - alpha) * (nL / n)
pM = alpha * baseAlloc + (1 - alpha) * (nM / n)
pR = alpha * baseAlloc + (1 - alpha) * (nR / n)

// Normalise
total = pL + pM + pR
pL /= total; pM /= total; pR /= total
```

If a region has 0 points, set its allocation to 0 and redistribute.

## Sub-scale construction

Build three D3 scales internally:
```
const totalW = range[1] - range[0]
const wL = totalW * pL
const wM = totalW * pM
const wR = totalW * pR

subScales = []
if (pL > 0) subScales.push({ type: 'log', scale: d3.scaleLog().domain([domain[0], bL]).range([range[0], range[0] + wL]) })
subScales.push({ type: 'linear', scale: d3.scaleLinear().domain([bL, bR]).range([range[0] + wL, range[0] + wL + wM]) })
if (pR > 0) subScales.push({ type: 'log', scale: d3.scaleLog().domain([bR, domain[1]]).range([range[0] + wL + wM, range[1]]) })
```

IMPORTANT: d3.scaleLog() cannot handle domain values of 0. If dMin is 0 or bR is 0, use a small epsilon (e.g., 0.001) instead.

## Tick generation (src/scale/ticks.js)

For each region, generate ticks using the sub-scale's native .ticks() method:
- Log regions: use the log scale's .ticks() which gives powers of 10
- Linear region: use the linear scale's .ticks(count) where count is proportional to pixel width

Concatenate all ticks, sort, deduplicate (values within 0.01% of each other).

The boundary values (bL, bR) should always appear in the tick array.

## Tests to make pass

Remove the .todo() from all tests in test/adaptive-scale.test.js and test/breakpoints.test.js. Make them pass.

Key tests:

1. MONOTONICITY: For 1000 evenly spaced values across the domain, verify scale(a) < scale(b) whenever a < b.

2. INVERTIBILITY: For 100 random values in the domain, verify |scale.invert(scale(v)) - v| < epsilon.

3. BOUNDARY CONTINUITY: Verify that scale(bL) computed by approaching from the left equals scale(bL) computed by the middle region. Same for bR.

4. EDGE CASES:
   - Empty data array: scale should behave like d3.scaleLinear()
   - Single data point: same
   - All identical values: same
   - No outliers (all within IQR fences): scale should be effectively linear
   - Only left outliers: only left tail is log, right tail is linear
   - Only right outliers: only right tail is log, left tail is linear

5. TICK GENERATION: Ticks should span the full domain, include boundary values, and not cluster excessively at region transitions.

Run `npm test` and verify all pass. Log the result.

After implementation, add a DEVLOG.md entry:
- **[HH:MM]** Scale core implemented: three-region piecewise (log-linear-log) with IQR and percentile breakpoint methods. All tests passing: monotonicity, invertibility, boundary continuity, edge cases.
```
