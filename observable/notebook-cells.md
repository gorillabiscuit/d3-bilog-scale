# Observable notebook — paste-ready cells (npm-backed, published package)

Paste each cell below into a new cell in the Observable editor, **in order, top to bottom**.
Cell type: `md` cells go into Markdown cells, `js` cells into JavaScript cells.

This version imports `d3-scale-adaptive@1.0.0` directly from npm via esm.sh — no manual
source transformation, no hand-split cells. Verified end-to-end in a real browser: the CDN
import resolves every export, the scale passes its invariants, and the chart renders
correctly (regions, dots, formatted ticks, embedded CSS all confirmed).

**Cells 2a/2b use dynamic `import()`, not Observable's static `import {...} from "url"`
syntax.** The static form only reliably parses as `import * as ns from "url"` (namespace
form) for external CDN URLs in classic notebooks — a destructured `import { a, b } from
"url"` throws a parse-time error there (confirmed live: red caret under `import`, then
`RuntimeError: createAdaptiveChart is not defined` downstream). Dynamic `import()` inside a
plain `name = await expr` cell is unambiguous JS, avoids Observable's import-statement
special-casing entirely, and is the exact mechanism verified against the published package
before this file was finalized.

---

## Cell 1 (md)

```md
# Adaptive piecewise scale — keeping outliers on screen without crushing the data

Most financial data is lumpy: the bulk of the values bunch into a narrow band, then a handful of outliers run two or three orders of magnitude past them. On a **linear** scale the cluster collapses into an unreadable sliver. On a **log** scale the cluster's internal structure distorts, and zero is unreachable.

`scaleAdaptive` splits the axis into three regions — a logarithmic tail on either side of a **linear focus window** — and allocates pixels so both the cluster and the outliers stay readable. The tail slope is solved so it *matches the window's slope at the joint*: the transition is seamless, not a broken axis.

Published on npm as [`d3-scale-adaptive`](https://www.npmjs.com/package/d3-scale-adaptive); source on [GitHub](https://github.com/gorillabiscuit/d3-bilog-scale).

**Try it:** drag the window body to pan · drag a handle to resize · click a tail section (or press ←/→) to travel onto it · double-click to reset.
```

---

## Cell 2 (js)

```js
scaleAdaptive = (await import("https://esm.sh/d3-scale-adaptive@1.0.0")).scaleAdaptive
```

---

## Cell 2b (js)

```js
createAdaptiveChart = (await import("https://esm.sh/d3-scale-adaptive@1.0.0")).createAdaptiveChart
```

---

## Cell 3 (js)

```js
viewof windowFraction = Inputs.range([0.05, 1], { value: 0.5, step: 0.01, label: "Linear window coverage" })
```

---

## Cell 4 (js)

```js
chart = {
  // Read the PLAIN windowState (reactive dependency: window changes re-run this cell);
  // write via `mutable windowState` inside the event handlers.
  const s = windowState;
  const node = createAdaptiveChart(loans, {
    x: d => d.amount,
    y: d => d.termMonths,
    label: d => d.borrower,
    meta: d => d.location,
    width, height: 420,
    mode: "piecewise",
    windowFraction,
    xLo: s.xLo ?? undefined,
    xHi: s.xHi ?? undefined,
    qLo: s.qLo ?? undefined,
    qHi: s.qHi ?? undefined,
    focusXLo: s.focusXLo ?? undefined,
    focusXHi: s.focusXHi ?? undefined,
    onWindowChange: ({ xLo, xHi, qLo, qHi }) => {
      const next = { ...s };
      if (next.focusXLo != null) { next.focusXLo = xLo; next.focusXHi = xHi; }
      else { next.xLo = xLo; next.xHi = xHi; }
      if (qLo != null) next.qLo = qLo;
      if (qHi != null) next.qHi = qHi;
      mutable windowState = next; // re-renders this cell with the window preserved
    },
    onTravel: ({ xLo, xHi }) => {
      mutable windowState = { focusXLo: xLo, focusXHi: xHi };
    },
    xLabel: "Loan amount (USD)",
    yLabel: "Term (months)",
    xFormat: "currency",
    rankNoun: "loans",
    spread: true,
    spreadSeed: this?.spreadOffsets, // keep each dot on its side of the cluster across re-renders
  });
  // CHART_CSS's fallback colours assume a DARK page (--ruler-tint defaults to white,
  // --chart-surface to navy) — right for the article this scale was built for, wrong for
  // Observable's white notebook page: the tail rulers render as invisible white-on-white
  // strokes. Setting the same custom properties the article's light theme uses fixes it.
  const lightTheme = {
    "--dot-fill": "#4040cc", "--axis-color": "#c0c0d8", "--axis-text": "#5050a0",
    "--label-color": "#8080b0", "--tooltip-bg": "#f0f0ff", "--tooltip-border": "#c0c0d8",
    "--tooltip-text": "#1a1a2e", "--tooltip-text-muted": "#5050a0",
    "--ruler-tint": "#4040cc", "--chart-surface": "#ffffff",
  };
  for (const [k, v] of Object.entries(lightTheme)) node.style.setProperty(k, v);
  return node;
}
```

---

## Cell 5 (js)

```js
mutable windowState = ({})
```

---

## Cell 6 (md)

```md
## The dataset

600 real US Small Business Administration 7(a) loans (FY2020+, from SBA's public loan-level data) — real transactions, not synthetic, fetched live from the [source repo](https://github.com/gorillabiscuit/d3-bilog-scale) (pinned to a specific commit, so the numbers below never drift). This is the exact shape the scale was built for: most Express loans sit under $150k, guarantees run up to $5M, and the middle of the market clusters tightly in between. Loan amount ($5k–$5M) is the skewed axis; term length is the secondary variable.
```

---

## Cell 7 (js)

```js
loans = {
  const res = await fetch("https://cdn.jsdelivr.net/gh/gorillabiscuit/d3-bilog-scale@2989b6eb740b73d9ea2fa2fd78e3e3b401d99e42/public/data/sba-sample.csv");
  const text = await res.text();
  return d3.csvParse(text)
    .slice(0, 600)
    .map((r) => ({
      amount: Number(r.grossapproval),
      termMonths: Number(r.terminmonths),
      borrower: r.borrname,
      location: [r.borrstate, (r.naicsdescription || "").trim()].filter(Boolean).join(" · "),
    }))
    .filter((p) => p.amount > 0 && p.termMonths > 0 && Number.isFinite(p.amount) && Number.isFinite(p.termMonths));
}
```

---

## Cell 8 (md)

```md
## The scale

`scaleAdaptive` implements the full d3 continuous-scale contract — `domain`, `range`, `ticks`, `tickFormat`, `nice`, `clamp`, `unknown`, `invert`, `copy` — so it drops straight into `d3.axisBottom` or anything else that expects a scale. Four invariants hold in every configuration:

1. **Monotonicity** — `scale(a) < scale(b)` whenever `a < b`.
2. **Invertibility** — `scale.invert(scale(v)) ≈ v`.
3. **Boundary continuity** — the pixel at a region boundary is identical whether approached from the log or the linear side. The tail slope is solved (bisection on the symlog constant) to match the linear window's slope at the joint, so the transition is seamless.
4. **Graceful degradation** — no outliers → plain linear scale; outliers on one side only → one tail.

Custom methods: `.data(values)` (breakpoint detection), `.breakpointMethod('iqr' | 'log-iqr' | 'percentile' | 'quantile')`, `.window(fraction)`, `.linearDomain()` / `.linearRange()` / `.focusDomain()` (window placement), `.regions()`, `.windowBounds()`.

Full API reference and the test suite (86 tests covering the four invariants) are in the [source repo](https://github.com/gorillabiscuit/d3-bilog-scale).
```

---

## Cell 9 (md)

```md
## Notes

- The linear window is **capped** so it can never swallow an outlier tail entirely — a structural guarantee (`windowBounds()`), not a heuristic, which is why no drag sequence can flatten the cluster.
- Dot spread (y-only collision, x stays exact) is **seeded across re-renders**: each simulation starts from the previous arrangement at low alpha, so dots keep their side of the cluster instead of reshuffling on every drag.
- Tick candidates are generated in magnitude space and mirrored, so negative and zero-crossing domains get proper ticks in both tails.
```

---

## Cell 10 (js)

```js
d3 = require("d3@7")
```
