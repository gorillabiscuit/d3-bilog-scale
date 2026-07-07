# Submitting to Observable — step by step

The paste-ready cells live in [notebook-cells.md](notebook-cells.md) — just **12 cells**,
in order. This version imports the published npm package
([`d3-scale-adaptive`](https://www.npmjs.com/package/d3-scale-adaptive)) directly from a CDN
(`https://esm.sh/d3-scale-adaptive@1.0.0`) via two dynamic-`import()` cells (2a/2b) — no
manually-transformed library source to paste, and esm.sh resolves all the underlying
`d3-scale`/`d3-array`/etc. bare imports automatically. (Observable's *static*
`import {a, b} from "url"` syntax does NOT reliably support destructured named imports from
arbitrary CDN URLs in classic notebooks — confirmed by hitting it live. Dynamic `import()`
inside a plain cell sidesteps that entirely.)

The chart cell also sets light-theme CSS custom properties directly on the returned node
(`--ruler-tint`, `--chart-surface`, etc.). The library's default colours assume a **dark**
page background (built for the source article's dark theme) — on Observable's white page,
the tail-ruler strokes render white-on-white and vanish. This was caught by comparing the
live notebook screenshot against the reference chart and confirmed by inspecting computed
styles before and after the fix.

Verified end-to-end in a real browser before handing off: the CDN import resolves every
export, the scale passes its invariants, and the chart renders correctly against the real
embedded SBA loan dataset (600 real rows, correct regions, formatted currency ticks).

## Steps

1. **Create the notebook** at observablehq.com → New notebook.
2. **Title:** `Adaptive piecewise scale` (subtitle idea: *keeping outliers on screen without crushing the data*).
3. **Paste the cells** from `notebook-cells.md` top to bottom — `md` blocks into Markdown
   cells, `js` blocks into JavaScript cells. Order in the file is presentation order;
   Observable resolves dependencies topologically, so it will run correctly as soon as
   all cells are in, regardless of paste order.
4. **Check the demo:** the chart cell should render the SBA loan dataset with the window
   slider live. Drag the window / handles and confirm the position persists across the
   reactive re-render (that's the `mutable windowState` loop).
5. **Add a thumbnail** — Observable auto-captures, but a manually chosen frame of the
   chart mid-interaction reads much better in the gallery.
6. **Publish** → public. Add topics/tags: `d3`, `visualization`, `scales`, `outliers`.
7. **License:** ISC or MIT footer cell is conventional for reusable code notebooks —
   the package itself is ISC-licensed.

## What reviewers will look at first

- The **npm package** — a published, versioned, real dependency is a strong reusability
  signal on its own; the notebook demos it rather than embeds a copy of it.
- The **demo interaction** — drag, travel, reset.
- The **source repo** ([github.com/gorillabiscuit/d3-bilog-scale](https://github.com/gorillabiscuit/d3-bilog-scale))
  for the d3 contract methods, the four invariants, and the 86-test suite — linked from
  cell 1 and cell 9.

## Two Observable-specific notes

- `width` in the chart cell is Observable's built-in reactive page width — the chart
  re-renders on window resize for free. Height is fixed at 420.
- `this?.spreadOffsets` in the chart cell reads the *previous* render's dot arrangement
  (a cell's `this` is its prior value), which is what keeps dots on their side of the
  cluster across re-renders.

## If you update the library later

Bump the version in `package.json`, `npm publish` again, then update the CDN URL in cell 2
(`d3-scale-adaptive@1.0.1` etc.) — no need to touch anything else in the notebook. This is
the whole point of the npm-backed approach: the notebook stays thin, and updates are a
one-line change instead of re-pasting transformed source.

## After publishing

- Link the notebook from the article (wouterschreuders.com) and vice versa — Observable
  profiles allow a website link, and the article gives the notebook its backstory. Also
  link the [npm package page](https://www.npmjs.com/package/d3-scale-adaptive) and the
  [GitHub repo](https://github.com/gorillabiscuit/d3-bilog-scale) from both.
- Consider a follow-up "how it works" notebook diving into `solveSymlogConstant` (the
  slope-matching bisection) — reviewers who like the scale will want the math.
