# Prompt 03 — Project Scaffold

**Goal:** Initial project scaffolding with scale-first architecture.

---

Read AGENTS.md first.

I'm building a new D3 scale type called scaleAdaptive. It handles datasets with extreme outliers on BOTH ends of the distribution by composing three sub-scales: log on the left tail, linear in the dense middle, log on the right tail. Breakpoints between regions are data-driven.

This is the project scaffolding step. Set up the following:

## 1. Vite project with D3 and Vitest

- `npm init -y`
- Install: vite, vitest, d3 (v7+)
- Create vite.config.js (vanilla JS, no framework)
- Create vitest.config.js
- Add scripts to package.json: "dev", "build", "test", "test:watch"

## 2. Project structure

Create these files with just the exports/stubs (no implementation yet):

```
src/
  scale/
    adaptive-scale.js    → export function scaleAdaptive() { ... }
    breakpoints.js       → export function detectBreakpoints(data, method) { ... }
    ticks.js             → export function generateTicks(regions, pixelBudget) { ... }
  chart/
    adaptive-chart.js    → export function createAdaptiveChart(container, data, options) { ... }
    linear-chart.js      → export function createLinearChart(container, data, options) { ... }
    log-chart.js         → export function createLogChart(container, data, options) { ... }
  data/
    generators.js        → export functions for 5 test datasets (see below)
  index.js               → imports and renders all three charts
```

## 3. Test stubs

```
test/
  adaptive-scale.test.js → describe blocks for: monotonicity, invertibility, boundary continuity, edge cases, graceful degradation
  breakpoints.test.js    → describe blocks for: IQR method, percentile method, empty data, single cluster
```

Use vitest. Import from the src files. Tests should be written but marked with `test.todo()` for now.

## 4. Index.html

A dev page with:
- Three side-by-side chart containers (divs with ids: chart-linear, chart-log, chart-adaptive)
- A dataset selector (dropdown) to switch between the 5 test datasets
- Basic CSS: dark background (#1a1a2e), light text, flex layout for the three charts
- Script tag loading src/index.js as type="module"

## 5. Test dataset generators (src/data/generators.js)

Generate synthetic LTV + APR data for 5 scenarios. Each dataset returns an array of {ltv, apr} objects.

1. **generateBaseline(n=200)**: All values clustered at LTV 40-80%, APR 8-25%. No outliers. Normal distribution within the cluster.
2. **generateLeftSkew(n=200)**: Same cluster as baseline plus ~20 low outliers with LTV 2-35%. Low LTV loans should have higher APR (more risk for lender).
3. **generateRightSkew(n=200)**: Same cluster plus ~20 high outliers with LTV 100-5000%. High LTV loans should have varied APR.
4. **generateBothTails(n=200)**: The canonical case. Cluster at 40-80% LTV, plus ~15 low outliers (2-35% LTV) and ~20 high outliers (100-5000% LTV). This is the primary test case.
5. **generateExtreme(n=200)**: Tight cluster at 55-65% LTV, plus outliers spanning 0.5% to 50,000% LTV. Maximum dynamic range. Stress test.

Use seeded random (implement a simple mulberry32 PRNG) so datasets are reproducible. Each generator takes an optional seed parameter.

## 6. DEVLOG.md

Log a first scaffold entry.

## 7. devlog/prompts/

Save this prompt to devlog/prompts/03-scaffold.md.

---

Do NOT implement the scale yet. Just stubs. The structure and test harness are the deliverable.

Run `npm run dev` at the end to confirm the page loads. Run `npm test` to confirm tests are found (they'll be todo/skipped).
