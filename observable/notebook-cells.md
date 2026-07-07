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
  const node = createAdaptiveChart(sales, {
    x: d => d.price,
    y: d => d.perSqFt,
    label: d => d.address,
    meta: d => d.neighbourhood,
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
    xLabel: "Sale price (USD)",
    yLabel: "Price per sq ft (USD)",
    xFormat: "currency",
    rankNoun: "sales",
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

A frozen snapshot of NYC's rolling property-sales feed (data.cityofnewyork.us), captured 2026-06-29 — real transactions, not synthetic. It has exactly the shape the scale exists for: $0/$1 nominal deed transfers sit at one extreme, a $168M hotel sale at the other, and the bulk of ordinary residential and small-commercial sales cluster in between.
```

---

## Cell 7 (js)

```js
sales = d3.csvParse(salesCSV, (d) => ({
  price: +d.x,
  perSqFt: +d.y,
  address: d.label,
  neighbourhood: d.meta,
}))
```

---

## Cell 8 (js)

```js
salesCSV = "x,y,label,meta\n540000,29.582557247726527,\"745 East 6th Street, 1b\",Alphabet City · Rentals - Walkup Apartments\n8600000,442.88804202286536,208 East 7th Street,Alphabet City · Rentals - Walkup Apartments\n4665000,1401.7427884615386,191 East 7 Street,Alphabet City · Rentals - Walkup Apartments\n280000,40.72727272727273,\"510 East 5th Street, 9\",Alphabet City · Rentals - Walkup Apartments\n8800000,1228.0212112754675,207 East 4 Street,Alphabet City · Rentals - Walkup Apartments\n4000000,572.2460658082975,327 East 10 Street,Alphabet City · Rentals - Walkup Apartments\n13000000,454.22781271837874,183 Avenue C,Alphabet City · Rentals - Elevator Apartments\n16700000,383.73161764705884,176 East 3 Street,Alphabet City · Rentals - Elevator Apartments\n8685245,767.9261715296198,204 Avenue A,Alphabet City · Rentals - Elevator Apartments\n597997,52.87329796640142,\"204 Avenue A, 3a\",Alphabet City · Rentals - Elevator Apartments\n112250000,1015.5613860490365,\"250 East Houston Street, 1\",Alphabet City · Special Condo Billing Lots\n3550000,509.325681492109,703 East 6 Street,Alphabet City · Office Buildings\n5000000,1183.7121212121212,195 East 3 Street,Alphabet City · Theatres\n4775000,1419.8632173654476,304 West 18th Street,Chelsea · One Family Dwellings\n13100000,2980.6598407281003,344 W 22 Street,Chelsea · One Family Dwellings\n13500000,4437.869822485207,348 West 22 Street,Chelsea · One Family Dwellings\n11600000,1486.2267777065983,217 West 20 Street,Chelsea · One Family Dwellings\n7650000,2273.402674591382,204 West 21st Street,Chelsea · One Family Dwellings\n10600000,1578.5554728220402,224 West 22nd Street,Chelsea · One Family Dwellings\n14999999,1667.2222963209958,150 West 15th Street,Chelsea · One Family Dwellings\n4999999,1025.6408205128205,443 West 19th Street,Chelsea · Two Family Dwellings\n4500000,1339.2857142857142,447 West 24th,Chelsea · Two Family Dwellings\n7800000,1846.590909090909,343 West 19 Street,Chelsea · Two Family Dwellings\n10600000,1152.1739130434783,313 West 20 Street,Chelsea · Two Family Dwellings\n7500000,1704.5454545454545,125 West 15th Street,Chelsea · Three Family Dwellings\n5750000,809.8591549295775,446 West 19th Street,Chelsea · Rentals - Walkup Apartments\n9250000,1159.1478696741854,410 West 22nd Street,Chelsea · Rentals - Walkup Apartments\n10,0.0009402914903620122,246 10th Avenue,Chelsea · Rentals - Walkup Apartments\n10,0.001035625517812759,248 10th Avenue,Chelsea · Rentals - Walkup Apartments\n6650000,1209.090909090909,331 West 19 Street,Chelsea · Rentals - Walkup Apartments\n16625000,1539.351851851852,205 8 Avenue,Chelsea · Rentals - Walkup Apartments\n16625000,1539.351851851852,207 8 Avenue,Chelsea · Rentals - Walkup Apartments\n5000000,874.1258741258741,356 West 21st Street,Chelsea · Rentals - Walkup Apartments\n5400000,1200,217 West 15 Street,Chelsea · Rentals - Walkup Apartments\n45500,3.3886944216876445,534 West 29,Chelsea · Rentals - Elevator Apartments\n20000000,1047.1204188481674,448-450 West 19th Street,Chelsea · Rentals - Elevator Apartments\n242500,20.815450643776824,\"411 West 24th Street, 11e\",Chelsea · Rentals - Elevator Apartments\n8500000,414.7150663544106,313-315 West 21 Street,Chelsea · Rentals - Elevator Apartments\n12500000,991.3553810770085,135 West 24th Street,Chelsea · Rentals - Elevator Apartments\n21000000,2720.559657986786,58-60 Ninth Ave,Chelsea · Rentals - 4-10 Unit\n350000,105.10510510510511,210 7 Avenue,Chelsea · Rentals - 4-10 Unit\n46181250,837.5120146533433,541 West 21 Street,Chelsea · Office Buildings\n3250000,91.29213483146067,\"127 West 24th Street, 2\",Chelsea · Office Buildings\n7100000,614.7186147186147,131 West 14 Street,Chelsea · Store Buildings\n168618594,1089.182970312379,113-117 West 24 Street,Chelsea · Luxury Hotels\n25150000,727.6777964238181,550 West 25 Street,Chelsea · Commercial Garages"
```

---

## Cell 9 (md)

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

## Cell 10 (md)

```md
## Notes

- The linear window is **capped** so it can never swallow an outlier tail entirely — a structural guarantee (`windowBounds()`), not a heuristic, which is why no drag sequence can flatten the cluster.
- Dot spread (y-only collision, x stays exact) is **seeded across re-renders**: each simulation starts from the previous arrangement at low alpha, so dots keep their side of the cluster instead of reshuffling on every drag.
- Tick candidates are generated in magnitude space and mirrored, so negative and zero-crossing domains get proper ticks in both tails.
```

---

## Cell 11 (js)

```js
d3 = require("d3@7")
```
