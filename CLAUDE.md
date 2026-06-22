# Project: d3-outlier-graphs

Five interactive D3.js visualizations, each taking a different approach to the same problem: displaying a financial dataset where extreme outliers distort the scale for the majority of data points.

**Dataset**: 200 small business loans. 84% under $10K, median ~$6K. 10 outliers from $120K–$1.2M.

---

## Publication target: Observable

**This code will be submitted to Observable.** That sets the quality bar.

Observable is the canonical home for D3 work — Mike Bostock reads submissions. Every idiom, every pattern, every line of chart code must be the way the D3 community would write it, not a workable approximation.

### What this means in practice

- **Use `viewBox` + CSS sizing, never fixed `width`/`height` SVG attributes.** Observable notebooks are responsive by default.
- **Follow the general update pattern.** `selectAll('*').remove()` is a nuclear option acceptable only for a one-shot static render. Any chart that responds to data changes must use `.join()` with proper enter/update/exit so transitions are possible.
- **No `d3.mouse()` — it was removed in v6.** Use `pointer(event, element)` from `d3-selection` for element-relative coordinates.
- **Margin convention is sacred.** `{top, right, bottom, left}` with `g.attr('transform', 'translate(margin.left, margin.top)')`. Do not deviate.
- **Axes are styled via `.call()` chaining**, not manual attribute loops after the fact.
- **Scales are pure math.** Never touch the DOM inside a scale. The scale layer has zero knowledge of SVG.
- **Observable expects ES modules.** No CommonJS, no bundled imports, no `import * as d3`.
- **Transitions belong on the chart, not the scale.** The scale returns numbers; D3 transitions interpolate between them.
- **clipPath ids must be unique per chart instance** — Observable renders many cells simultaneously; a shared global id silently breaks clipping across cells.
- **`ResizeObserver` is the correct pattern** for responsive charts in a browser context. Observable handles resize differently (cell re-execution) but the underlying principle is the same: never read `clientWidth` once and cache it forever.

### Before every commit

Ask: would this pass a Mike Bostock code review? If you are unsure whether a pattern is idiomatic, check the D3 source, Observable examples, or the D3 changelog for v5→v6→v7 migrations. Do not guess.

---

## Process Capture Rules

This project is being written up as an article. Capture the process as it happens.

### DEVLOG.md

Append a timestamped one-liner to `DEVLOG.md` whenever:

- A library, scale type, or visual encoding is chosen or rejected
- A dead end is hit (something doesn't work or looks wrong)
- The data reveals something unexpected
- A meaningful design or technical tradeoff is made
- An approach is abandoned in favour of another

Format: `- **[HH:MM]** [What happened and why, one sentence]`

Do not write retrospective summaries. Capture decisions as they happen.

### Screenshot reminders

You cannot take screenshots. Prompt the user at these moments:

- Before fixing something that looks broken (the "before" is more valuable than the "after")
- When a new chart variant first renders
- When two approaches are side by side and the difference is visible
- When a scale change dramatically alters readability

Use this exact format:

```
📸 SCREENSHOT: [description of what to capture and why it matters for the article]
```

### Prompt archiving

When the user gives a prompt that represents a meaningful design decision (not routine code edits), save it to `devlog/prompts/` as a numbered markdown file with the prompt text and a one-line note on what it was trying to achieve.

Format: `devlog/prompts/01-initial-research.md`, `devlog/prompts/02-symlog-pivot.md`, etc.

### What NOT to capture

- Routine setup, installs, config changes
- Linting fixes, formatting, boilerplate
- Anything that doesn't involve a choice

---

## Architecture

Two layers. The SCALE is pure math with zero DOM dependencies. The CHART is D3 rendering on top.

```
src/scale/   → pure functions, testable with vitest
src/chart/   → D3 rendering, interaction, transitions
```

Never mix DOM code into the scale layer. If you need to touch the DOM, it goes in src/chart/.

## The scale contract

The scale MUST implement these methods for d3-axis compatibility:
- `scale(value)` — domain to range mapping
- `scale.domain([min, max])` — getter/setter
- `scale.range([min, max])` — getter/setter
- `scale.copy()` — independent clone
- `scale.ticks(count)` — tick values respecting region boundaries
- `scale.tickFormat(count, specifier)` — tick label formatting

Plus these for interaction:
- `scale.invert(pixel)` — range to domain (for tooltips, brushing)
- `scale.clamp(bool)` — extrapolation control

Custom methods:
- `scale.data(values)` — pass raw data for breakpoint detection
- `scale.breakpointMethod(method)` — 'iqr', 'quantile', 'percentile', 'log-iqr'
- `scale.regions()` — returns array of {type, domain} objects describing the current regions

## Critical invariants

1. **Monotonicity**: `scale(a) < scale(b)` whenever `a < b`. Always. No exceptions.
2. **Invertibility**: `scale.invert(scale(v)) ≈ v` within floating-point tolerance.
3. **Boundary continuity**: The pixel position at a region boundary must be identical whether computed from the left or right region's sub-scale.
4. **Graceful degradation**: If the data has no outliers, the scale should behave like a linear scale. If outliers exist on only one side, only that tail should be logarithmic.

Test for all four after any change to the scale math. Run `npm test` before committing.

## Code style

- Vanilla JS (ES modules). No TypeScript. Observable notebooks are vanilla JS.
- D3 v7. Import individual modules, not the full d3 bundle.
- No build-time dependencies beyond Vite and Vitest.
- Comments explain WHY, not WHAT. The code should be readable without comments.
- Variable names should be descriptive: `leftBreakpoint` not `lb`, `pixelBudget` not `pb`.

## Testing

Run with `npm test`. Test files in `test/`.

Priority test categories:
1. Monotonicity across all regions and boundaries
2. Invertibility (round-trip: value → pixel → value)
3. Boundary continuity (no jumps at region transitions)
4. Edge cases (empty data, single point, all identical, negatives, zero)
5. Tick generation (reasonable distribution across mixed regions)
6. Graceful degradation (no outliers → linear behavior)

---

## Research

Full research output lives in `d3-outlier-viz/`:
- `outline.yaml` — 21 techniques catalogued
- `fields.yaml` — 13 research fields per technique
- `results/` — 21 JSON files, one per technique
- `report.md` — full synthesised report

Key corrections from deep research:
- `d3.density()` / `d3.kde()` are NOT real D3 v7 APIs — KDE must be hand-rolled for violin plots
- `d3.facet()` is NOT D3 v7 — it is Observable Plot only; use `d3.group()` in raw D3
- `d3-scale-break`: 4★, last push 2023, effectively unmaintained — avoid as dependency
- `d3-annotation` (Susie Lu): 762★, unmaintained since 2019 but works with D3 v7
- Cleveland explicitly recommends full-panel break (small multiples) over slashed-axis break
