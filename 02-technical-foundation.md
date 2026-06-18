# Technical Foundation: Decisions Before Writing Code

## The deliverable

A reusable D3 scale (`d3-scale-adaptive`) packaged as an ES module, plus an Observable notebook that demos it with three charts (linear, log, adaptive) using real data. The notebook is the article; the scale is the contribution.

## Architecture: Scale-First, Chart Second

The project has two layers:

### Layer 1: The Scale (pure math, no DOM)
```
src/
  adaptive-scale.js    // The scale factory function
  breakpoints.js       // Algorithms for detecting dense cluster boundaries
  compression.js       // Log compression with configurable base per region
  interpolate.js       // Piecewise interpolation (log-linear-log)
  ticks.js             // Tick generation across mixed regions
  invert.js            // Pixel-to-value inversion (for interaction)
```

This layer has ZERO DOM dependencies. It's pure `domain → range` mapping. It can be tested independently with vitest.

The scale API follows D3 conventions:
```js
import { scaleAdaptive } from './adaptive-scale.js'

const x = scaleAdaptive()
  .domain([5, 5000])        // full data extent
  .range([0, 800])          // pixel range
  .data(ltvValues)          // pass the actual data for breakpoint detection
  .breakpointMethod('iqr')  // or 'percentile', 'density', 'jenks'
  .tailBase(10)             // log base for tail compression

x(50)       // → pixel position (in the linear region)
x(5000)     // → pixel position (in the right log region)
x.invert(400) // → data value at pixel 400
x.ticks()   // → array of tick values, respecting region boundaries
x.regions() // → [{type: 'log', domain: [5, 38]}, {type: 'linear', domain: [38, 82]}, {type: 'log', domain: [82, 5000]}]
```

### Layer 2: The Chart (D3 rendering + interaction)
```
src/
  chart.js             // Main chart component (SVG rendering)
  interaction.js       // Hover expansion / focus+context behaviour
  annotations.js       // Compression indicators (vertical lines at log steps)
  transitions.js       // Animated transitions between states
```

This layer uses D3 for DOM manipulation and handles the visual encoding, interaction, and the three comparison charts.

## Harness

### Development
- **Vite** for dev server and HMR. Fast, zero-config for vanilla JS.
- **Vanilla JS (ES modules)**, not TypeScript. Reason: Observable notebooks are vanilla JS. If the scale needs to work as an Observable import, TypeScript adds a compilation step that fights the platform. Types can be added later via JSDoc annotations + a `.d.ts` file.
- **D3 v7** (latest stable). Import individual modules: `d3-scale`, `d3-array`, `d3-axis`, `d3-selection`, `d3-transition`, `d3-shape`.

### Testing
- **Vitest** for the scale layer. The scale is pure functions: given domain, range, data → expected pixel output. This is straightforward to test.
- Key test categories:
  - **Monotonicity**: `x(a) < x(b)` whenever `a < b` for all a, b in domain
  - **Invertibility**: `x.invert(x(v)) ≈ v` for all v in domain (within floating point tolerance)
  - **Boundary continuity**: Values at region boundaries map to the same pixel from either region
  - **Edge cases**: Empty data, single value, all identical values, zero, negative values, extreme ranges
  - **Tick generation**: Ticks respect region boundaries, don't cluster at transitions, provide reasonable density in each region

### Build / Export
- **Rollup** (via Vite's library mode) to produce:
  - ES module (`d3-scale-adaptive.esm.js`) for import
  - UMD bundle (`d3-scale-adaptive.js`) for Observable/script tag
- Observable import: `d3ScaleAdaptive = require("d3-scale-adaptive")` or ESM import

## Project Structure

```
outlier-viz/
├── index.html                 // Dev page with all three charts
├── vite.config.js
├── vitest.config.js
├── package.json
├── src/
│   ├── scale/
│   │   ├── adaptive-scale.js
│   │   ├── breakpoints.js
│   │   ├── compression.js
│   │   ├── interpolate.js
│   │   ├── ticks.js
│   │   └── invert.js
│   ├── chart/
│   │   ├── adaptive-chart.js
│   │   ├── linear-chart.js
│   │   ├── log-chart.js
│   │   ├── interaction.js
│   │   ├── annotations.js
│   │   └── transitions.js
│   ├── data/
│   │   ├── loader.js
│   │   └── generators.js      // Test dataset generators
│   └── index.js
├── data/
│   ├── loans-real.json         // Real dataset (TBD source)
│   ├── test-baseline.json
│   ├── test-left-skew.json
│   ├── test-right-skew.json
│   ├── test-both-tails.json
│   └── test-extreme.json
├── test/
│   ├── adaptive-scale.test.js
│   ├── breakpoints.test.js
│   ├── monotonicity.test.js
│   └── invertibility.test.js
├── devlog/
│   ├── DEVLOG.md
│   └── prompts/
├── AGENTS.md                   // AI assistant instructions
└── README.md
```

## Research Findings

Research completed. Key findings:

### 1. This is genuinely novel
No existing D3 scale implements log-linear-log piecewise composition. The closest prior art:
- **pseudoLogScale** (Observable forums): log-linear (2 segments only), hardcoded 50/50 range split, performance issues (recreates sub-scales on every call)
- **d3-scale-break** (Luke Whyte): multi-segment with `.scope()` for proportional allocation, but linear segments only
- **d3fc-discontinuous-scale**: removes gaps (weekends, etc.), does not change transform type per segment
- **d3.scaleSymlog**: single smooth transform `sign(x) * log1p(|x/c|)`, not piecewise

A 3-segment log-linear-log scale with data-driven breakpoints is a new contribution.

### 2. D3 scale contract for d3-axis compatibility
From reading d3-axis source:

**Required** (d3-axis will break without these):
- `scale(value)` - the function call itself
- `scale.range()` - getter, used to draw the domain line
- `scale.copy()` - used to create the position function
- `scale.domain()` - fallback tick values if .ticks() missing

**Strongly recommended** (d3-axis calls these if present):
- `scale.ticks(count)` - tick value generation
- `scale.tickFormat(count, specifier)` - tick label formatting

**Expected for interaction** (not called by d3-axis but needed for tooltips, brushing, zoom):
- `scale.invert(pixel)` - reverse mapping
- `scale.clamp(bool)` - extrapolation control
- `scale.nice(count)` - domain rounding

### 3. D3's polymap cannot mix transforms per segment
D3 applies the transform (log, pow, etc.) globally, THEN does piecewise linear interpolation on the transformed values. There is no way to have segment 1 use log and segment 2 use linear within the built-in architecture.

The scale must compose separate D3 sub-scales internally and dispatch based on which region the input value falls in. This is the approach the pseudoLogScale took.

### 4. Architecture decision: compose sub-scales
The scale internally maintains three D3 scales:
```js
// Internal state (not exposed)
const leftLog = d3.scaleLog().domain([leftMin, leftBreak]).range([0, leftPixels])
const middle = d3.scaleLinear().domain([leftBreak, rightBreak]).range([leftPixels, leftPixels + middlePixels])
const rightLog = d3.scaleLog().domain([rightBreak, rightMax]).range([leftPixels + middlePixels, totalPixels])
```
The outer `scale(x)` dispatches to the correct sub-scale based on where `x` falls. This guarantees monotonicity (each sub-scale is monotonic) and continuity at boundaries (sub-scale ranges are adjacent).

### 5. d3-fisheye: useful concept, different mechanism
The original d3-fisheye (archived, v3 API) used hyperbolic magnification: `sign * m * (d+1) / (d + m/|x-focus|) + focus`. The modern fork (duaneatat/d3-fisheye on npm) adds smoothing but is 2D radial only, not a 1D scale.

Our interactive expansion is structurally different: it changes the pixel allocation per region rather than applying continuous distortion. When a log region "expands", we redistribute pixels from the linear middle to that log region and rebuild the sub-scales. This is discrete, honest, and predictable.

### 6. Observable conventions for reusable scales
Named cells that return factory functions:
```js
// Cell named "scaleAdaptive"
function scaleAdaptive() {
  let domain, range, ...;
  function scale(x) { /* ... */ }
  scale.domain = function(_) { /* getter/setter */ };
  // ... etc
  return scale;
}
```
Every named cell is importable: `import {scaleAdaptive} from "@wouter/adaptive-scale"`. No export keyword needed.

## Process Capture

Follow the rules in `PROCESS-CAPTURE-RULES.md`. Key points:
- DEVLOG.md gets timestamped one-liners for every decision, dead end, or surprise
- 📸 SCREENSHOT prompts at key visual moments
- Prompts archived to `devlog/prompts/` when they represent design decisions
- No capturing of routine setup/config/formatting

## Sequence

1. Run research prompt (01-research-prompt-custom-scale.md)
2. Digest research, update this document with findings
3. Set up project scaffolding (Vite + D3 + Vitest)
4. Implement the scale (Layer 1) with tests
5. Build the three charts (Layer 2)
6. Add interaction (hover expansion)
7. Find/confirm real data source
8. Polish for Observable submission quality
9. Write the Observable notebook / article
