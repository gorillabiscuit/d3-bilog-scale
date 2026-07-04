# d3-scale-adaptive

A piecewise **log – linear – log** scale for D3 that keeps extreme outliers on screen without crushing the majority of your data.

Most real-world financial data is lumpy: 84% of the values bunch into a narrow band, then a handful of outliers run two or three orders of magnitude past them. On a linear scale the cluster collapses into an unreadable sliver; on a log scale the cluster's internal structure distorts. `scaleAdaptive` splits the axis into three regions — a logarithmic tail on each side of a linear focus window — and allocates pixels so both the cluster and the outliers stay readable.

The linear window is draggable, pannable and keyboard-accessible in the accompanying chart, and the compression in each log tail is made visible by *tail rulers*: equal-dollar chunks rendered at shrinking pixel widths.

## Quick start

```js
import { scaleAdaptive } from './src/scale/adaptive-scale.js';

const x = scaleAdaptive()
  .data(values)          // raw numbers — used for breakpoint detection
  .range([0, width]);

x(42_000);               // domain → pixel
x.invert(310);           // pixel → domain
x.ticks(8);              // "nice" ticks aware of all three regions
```

```js
import { createAdaptiveChart } from './src/chart/adaptive-chart.js';

const chart = createAdaptiveChart(loans, {
  x: d => d.principal,
  y: d => d.apr,
  label: d => d.borrower,
  width: 900,
  height: 400,
  xLabel: 'Loan principal (USD)',
  yLabel: 'APR (%)',
  xFormat: 'currency',
});
container.append(chart);
```

## The scale: `scaleAdaptive([domain, ][range])`

Implements the full d3 continuous-scale contract, so it drops into `d3.axisBottom(...)`, brushing, and anything else that expects a scale.

### Invariants

These hold for every configuration, enforced by the test suite:

1. **Monotonicity** — `scale(a) < scale(b)` whenever `a < b`.
2. **Invertibility** — `scale.invert(scale(v)) ≈ v` to floating-point tolerance.
3. **Boundary continuity** — the pixel at a region boundary is identical whether approached from the log or the linear side. The tail slope is solved (bisection on the symlog constant) to match the linear window's slope at the joint, so the transition is visually seamless.
4. **Graceful degradation** — no outliers → plain linear scale; outliers on one side only → one tail.

### d3-compatible methods

| Method | Behaviour |
|---|---|
| `scale(value)` | domain → range; `null`/`NaN` → `unknown()` value |
| `scale.invert(pixel)` | range → domain (pixel input clamped to range) |
| `scale.domain([min, max])` | getter/setter |
| `scale.range([min, max])` | getter/setter |
| `scale.ticks(count = 6)` | region-aware "nice" values, honouring `count` |
| `scale.tickFormat(count, specifier)` | delegated to the linear window's scale |
| `scale.nice(count)` | extends the outer domain to round values |
| `scale.clamp(bool)` | clamp domain-side input |
| `scale.unknown(value)` | result for `null`/`NaN` input (default `undefined`) |
| `scale.copy()` | independent, behaviourally identical clone |

### Adaptive methods

| Method | Behaviour |
|---|---|
| `scale.data(values)` | raw values for breakpoint detection; also sets the domain to the data extent |
| `scale.breakpointMethod(m)` | `'iqr'` (Tukey fences, default), `'log-iqr'` (fences in log space — right for multi-decade money data), `'percentile'` (fixed p10–p90), `'quantile'` (slider-driven, see `window`) |
| `scale.window(fraction)` | with `'quantile'`: how much of the data the linear window covers, 0–1 |
| `scale.linearDomain([lo, hi])` | explicitly place the window in domain units (capped so a tail can never vanish) |
| `scale.linearRange([r1, r2])` | explicitly place the window in pixels (drag interactions) |
| `scale.focusDomain([lo, hi])` | like `linearDomain` but uncapped — the "travel onto a tail" gesture |
| `scale.regions()` | `[{type, domain, range, pixels}]` for the current regions |
| `scale.windowBounds()` | `[floor, ceil]` the window may occupy — interaction code clamps to this |

## The chart: `createAdaptiveChart(data, options)`

Returns a detached `<svg>` node (the Observable cell pattern). All options are optional.

### Data

| Option | Default | Purpose |
|---|---|---|
| `x` | `d => d.x` | accessor for the adaptively-scaled (skewed) variable |
| `y` | `d => d.y` | vertical value accessor |
| `label` | `d => d.label` | tooltip headline (nullish → line omitted) |
| `meta` | `d => d.meta` | tooltip secondary line (nullish → line omitted) |

### Layout

| Option | Default | Purpose |
|---|---|---|
| `width` / `height` | `900` / `260` | outer size; rendered via `viewBox`, so CSS can rescale it |
| `marginTop/Right/Bottom/Left` | `32 / 24 / 48 / 56` | margin convention |

### Scale behaviour

| Option | Default | Purpose |
|---|---|---|
| `mode` | auto-detected | `'piecewise'` or `'log'`; default runs a skewness test (`detectScaleType`) |
| `breakpointMethod` | `'quantile'` | passed to the scale — see above |
| `windowFraction` | `0.5` | linear-window coverage for the `'quantile'` method |

### Axes & formatting

| Option | Default | Purpose |
|---|---|---|
| `xLabel` / `yLabel` | `'x'` / `'y'` | axis titles |
| `xFormat` / `yFormat` | `'~s'` | d3-format specifier, or `'currency'` for $-prefixed SI with `B` for billions |
| `yType` | `scaleLinear` | d3 scale constructor for the y axis |
| `yTicks` | `5` | y-axis tick count |

### Dots

| Option | Default | Purpose |
|---|---|---|
| `dotRadius` | auto by count | `2px` above 500 points, else `3px` |
| `dotOpacity` | auto by density | `0.35 / 0.55 / 0.8` by point count |
| `spread` | `false` | y-only collision spread (beeswarm-style): `true` = on, `false` = computed but shown at true positions until `node.setSpread(true)`, `null` = off entirely |

### Interaction & decoration

| Option | Default | Purpose |
|---|---|---|
| `onWindowDrag` | — | `({xLo, xHi, qLo, qHi})` on every drag frame (cheap, no re-render) |
| `onWindowChange` | — | same payload on release — persist it and re-render; **handles/pan render only if provided** |
| `onTravel` | — | `({xLo, xHi})` after a click/arrow travel completes |
| `xLo`/`xHi`, `qLo`/`qHi`, `focusXLo`/`focusXHi` | — | restore a persisted window (domain, pixel-fraction, and focus forms) |
| `minWindowPx` | `20` | narrowest the window can be dragged |
| `showHint` | `true` | the fading "click a section · ←/→ to travel" badge |
| `tailTintBase` / `tailTintStep` / `tailTintMax` | `0.02 / 0.012 / 0.10` | tint ramp of the tail-ruler chunks |
| `rulerMinPx` | `2` | chunk narrower than this stops the ruler (density cap) |
| `tailTexture` | `'ruler'` | `'ruler'` or `'hatch'` — the diagonal-hatch density encoding from the development process, kept as an option |
| `hatchSpacing` | `8` | hatch mode: spacing of the section nearest the window; each window-width section outward steps 0.75× denser (floor 1.5px) |
| `hatchOpacity` | `0.45` | hatch mode: stroke opacity of the diagonal lines |
| `hatchAngle` | `1` | hatch mode: `1` = `\` diagonals, `-1` = `/` |

### Node methods

The returned SVG node exposes imperative hooks for callers that persist state across re-renders:

| Method | Purpose |
|---|---|
| `node.setSpread(enabled, duration)` | animate dots between true and spread positions in place |
| `node.spreadOffsets` | settled spread offsets — pass back as `spreadSeed` on the next render so dots keep their side of the cluster |
| `node.springSpreadFrom(fromCy, duration)` | ease from the previous render's dot positions |
| `node.animateToWindow(...)` / `node.animateToAuto(...)` | tween the window (travel / reset) |
| `node.stopPan()` | cancel any auto-scroll timer before tearing the node down |

### Theming

Colours are CSS custom properties with dark-theme fallbacks baked in, so the chart renders standalone. Define the tokens to theme it:

```css
--dot-fill, --axis-color, --axis-text, --label-color,
--tooltip-bg, --tooltip-border, --tooltip-text, --tooltip-text-muted,
--ruler-tint, --chart-surface
```

## Interaction model

- **Drag the window body** to pan; push past an edge and it docks and auto-scrolls.
- **Drag a handle** to move one boundary; the axis, rulers and dots update live.
- **Click a tail chunk** (or press ←/→) to *travel*: that chunk's data fills the linear window and everything else becomes tail.
- **Shift+←/→** fine-pans; **double-click** resets to the automatic window.
- The window is *capped* so it can never swallow an outlier tail — a structural guarantee, not a heuristic (see `windowBounds()`).

## Architecture

```
src/scale/   pure math, zero DOM — testable with vitest
src/chart/   D3 rendering, interaction, transitions
```

The scale layer never touches the DOM. `npm test` runs 86 tests across monotonicity, invertibility, boundary continuity, edge cases (negative/zero-crossing domains included), tick generation and graceful degradation.

## Running locally

```
npm install
npm run dev      # Vite dev server — full interactive harness with dataset switcher
npm test         # vitest
```
