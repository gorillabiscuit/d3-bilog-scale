# DEVLOG — d3-outlier-graphs

Decision log for the article. Timestamped one-liners only.

---

- **[session-start]** Defined the core problem: 200 small business loans where 84% cluster under $10K but 10 outliers reach $1.2M, making a naive linear scale useless for the majority.
- **[research]** Chose to research 21 techniques across four categories (scale-transform, visual-encoding, interaction, layout) before committing to any implementation.
- **[research]** Rejected `d3-scale-break` plugin as a dependency: only 4 GitHub stars, pre-1.0, last pushed January 2023 — effectively unmaintained.
- **[research]** Noted that `d3.density()` and `d3.kde()` do not exist in D3 v7 — violin plots require a hand-rolled kernel density estimator; the outline.yaml was incorrect on this point.
- **[research]** Noted that `d3.facet()` does not exist in D3 v7 — it is an Observable Plot concept; raw D3 small multiples use `d3.group()` + per-tier SVGs.
- **[research]** Cleveland's strongest recommendation for skewed data: log scale first, then full-panel break (small multiples) if log won't work — explicitly prefers this over a slashed/partial axis break.
- **[research]** ECDF identified as the strongest literature-endorsed technique for reading exact outlier values (Cleveland, Wilke, Brooker) but currently underused in D3 tutorials.
- **[research]** Symlog (`d3.scaleSymlog`) identified as the key differentiator among scale transforms: the only one that handles $0 and negative values natively, addressing Cleveland's "when log won't work" condition.
- **[research]** d3-annotation (Susie Lu, 762★) confirmed as the canonical D3 approach for Tufte-style in-place outlier labeling; built for d3-v4 but works with v7, low-maintenance.
- **[research]** Focus+Context (`@d3/focus-context`) confirmed as the strongest single fit for this dataset: context strip keeps $1.2M loan to-scale while focus pane decompresses the $0–$10K mass.
- **[17:49]** Scale core implemented: three-region piecewise (log-linear-log) with IQR and percentile breakpoint methods. All 28 tests passing: monotonicity, invertibility, boundary continuity, edge cases, graceful degradation, D3 compatibility.
- **[15:00]** Project scaffolded: Vite + D3 v7 + Vitest. Three-chart layout with dataset selector. Five test dataset generators with seeded PRNG (mulberry32). Scale architecture split into src/scale/ (pure math) and src/chart/ (DOM/D3).
- **[18:35]** Applied fmt() formatter globally to all chart x-axes — linear scale was showing raw numbers (20,000,000) because d3.scaleLinear also has a .tickFormat method, making the adaptive-vs-native check unreliable; switched to checking for .breakpointMethod instead.
- **[18:35]** Set MIN_GAP=72px for adaptive scale tick post-filter — at 1150px inner width the 48px threshold still allowed 17 ticks in the dense cluster region; 72px brings it down to ~11.
- **[18:47]** D3 idiom audit: found 7 issues — removed unused pointer import, switched SVG to viewBox+CSS sizing, replaced container.id-based clipPath ids with an incrementing counter, added ResizeObserver with 120ms debounce, added scale.type='adaptive' to replace duck-type check on breakpointMethod, fixed yPad fallback for small y values.
- **[19:02]** Rewrote chart layer to Observable cell pattern: createChart() returns svg.node() via d3.create(), SVG-internal tooltip using pointer(event, g.node()), d3-format replaces hand-rolled formatter, per-dataset xFormat/yFormat specifiers in loaders, replaceChildren() in index.js.
- **[19:15]** Added x-axis gridlines to adaptive chart using tickValues(xScale.ticks()) + tickSize(-innerH) — gridlines share exact positions with axis labels; the log-spaced crowding in the tails vs even linear spacing in the middle is now immediately visible.
- **19:16** Replaced flat gridlines with semi-log paper ruling: lines at every integer multiple within each decade (1×–9×) mapped through a log sub-scale, producing visible bunching near each power of 10 — compression encoded as physical density rather than labelling.
- **[20:51]** Added distribution detection (skewness ratio test on log-transformed values) — USGS now auto-selects log scale and disables slider; NYC/SBA stay on piecewise
- **[21:22]** Added KDE and mixture-model window detection as alternatives to quantile — dropdown lets user compare all three on the same data
- **[23:15]** Fixed pixel-boundary jump: quantile method now derives r1/r2 from slider fraction directly; KDE/mixture use smoothFraction() (linear interpolation through sorted values) instead of discrete count
- **[23:19]** Fixed runaway tick-line loop: break as soon as consecutive ticks are < 2px apart (power scale compresses monotonically, so first gap below threshold means all further gaps will be too)
- **[23:24]** Fixed inverted scale on KDE/Mixture/Quantile: 0.001×range clamp in windowQuantile was larger than the actual 25th percentile on USGS data (250k > 4), swapped xLo and xHi silently — replaced with 1e-9 epsilon
- **[23:29]** Added test suite for window functions: xLo<xHi invariant, monotonicity, bounds, and edge cases across NARROW/WIDE/BIMODAL dataset shapes — caught two real bugs (KDE/Mixture unbounded output, fp round-trip)
- **[09:20]** Fixed slider jumps: replaced smoothFraction (empirical CDF, jumps at data clusters) with hybrid — quantile uses 0.5-slider/2 (linear, data-free), KDE/Mixture use logFraction (log-space position of xLo/xHi) — all methods now at step ratio 1.0 across all dataset shapes
- **[09:25]** Fixed tick-line runaway on extreme-range datasets: replaced manual domain-step while-loop with scalePow.ticks(n) — the same algorithm d3-axis uses; budget proportional to each tail's pixel fraction caps total lines at ~12
- **[09:47]** Removed KDE and Mixture model from UI dropdown — both methods placed the linear region off-centre (left/right instead of middle) which made the chart harder to read than quantile, and drag handles make method selection redundant; implementations kept in window.js
- **[09:47]** Added drag handles at linear-region boundaries — full-height hit area + visible grip dots; live preview updates circles + overlay rect on drag (no full re-render); onWindowChange callback triggers re-render on dragend with manualXLo/manualXHi stored in index.js; slider input clears manual overrides
- **[09:52]** Added pan interaction on linear region overlay — box moves in pixel space, xScale.invert maps new pixel positions back to domain so "different portion of data" is revealed without changing window width; dots remain hoverable because overlay is .lower()'d below them in SVG DOM order
- **[09:55]** Fixed tooltip access in linear region — pan overlay was appended after dots (higher SVG z-order) blocking pointer events; moved pan drag to the existing overlay rect which was already .lower()'d below dots
- **[10:01]** Made chart full-page — hid linear/log comparison charts with display:none; adaptive chart gets flex:1 + min-height:0 to fill remaining viewport; SVG uses width:100%/height:100% instead of height:auto to actually fill flex container
- **[10:05]** Added clipPadding option to base-chart — expands clipPath by dot radius on all sides so edge dots render fully; exposed as an API option per Mike Bostock idiom (caller decides, chart doesn't assume)
- **[10:08]** Removed log mode toggle — always use piecewise scale; detectScaleType still runs but mode is overridden to 'piecewise' in renderExperimental
- **[10:15]** Fixed qLo/qHi drag-handle overrides not persisting across re-renders — dragend callback now passes pixel fractions (finalR1/innerW, currentR2/innerW) into onWindowChange; index.js stores manualQLo/QHi and passes them back as qLoOverride/qHiOverride on next render
- **[10:22]** Fixed slider snapping linear window to center after pan — slider now only updates qLo/qHi (pixel fractions), leaving domain values untouched; the panned range stays fixed while slider controls pixel budget
- **[10:45]** Config consolidation: pulled all magic numbers (dot color, radius, opacity, axis colors, tail tick count, overlay/tick colors) out of chart functions into a single options object; makeFmt deduplicated and exported from base-chart.js
- **[10:47]** Added dark/light theme system — CSS custom properties on :root/:data-theme drive page chrome; THEMES.dark/light objects in index.js drive SVG chart colors; toggle button re-renders chart with new theme
- **[10:48]** Added Chart Settings panel — dot size (auto/2px/3px/5px), opacity slider (auto → explicit), tail lines count slider (0–12); all values live-update on change
