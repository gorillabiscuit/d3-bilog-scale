# Submitting to Observable — step by step

The paste-ready cells live in [notebook-cells.md](notebook-cells.md) (20 cells, in order).
The transformed code has been verified: the scale passes all four invariants under the
notebook's `d3` namespace, and the chart renders correctly in a browser against `d3@7`.

## Steps

1. **Create the notebook** at observablehq.com → New notebook.
2. **Title:** `Adaptive piecewise scale` (subtitle idea: *keeping outliers on screen without crushing the data*).
3. **Paste the cells** from `notebook-cells.md` top to bottom — `md` blocks into Markdown
   cells, `js` blocks into JavaScript cells. Order in the file is presentation order;
   Observable resolves dependencies topologically, so it will run correctly as soon as
   all cells are in.
4. **Check the demo:** the chart cell should render the 200-loan dataset with the window
   slider live. Drag the window / handles and confirm the position persists across the
   reactive re-render (that's the `mutable windowState` loop).
5. **Add a thumbnail** — Observable auto-captures, but a manually chosen frame of the
   chart mid-interaction reads much better in the gallery.
6. **Publish** → public. Add topics/tags: `d3`, `visualization`, `scales`, `outliers`,
   `finance`.
7. **License:** ISC or MIT footer cell is conventional for reusable code notebooks.

## What reviewers will look at first

- The **scale cell** (`scaleAdaptive`) — the d3 contract methods and the four invariants
  documented in the prose cell directly above it.
- The **demo interaction** — drag, travel, reset.
- Whether the chart is **actually reusable** — it is: accessors, margins, exposed options.

## Two Observable-specific notes

- `width` in the chart cell is Observable's built-in reactive page width — the chart
  re-renders on window resize for free. Height is fixed at 420.
- `this?.spreadOffsets` in the chart cell reads the *previous* render's dot arrangement
  (a cell's `this` is its prior value), which is what keeps dots on their side of the
  cluster across re-renders.

## After publishing

- Link the notebook from the article (wouterschreuders.com) and vice versa — Observable
  profiles allow a website link, and the article gives the notebook its backstory.
- Consider a follow-up "how it works" notebook diving into `solveSymlogConstant` (the
  slope-matching bisection) — reviewers who like the scale will want the math.
