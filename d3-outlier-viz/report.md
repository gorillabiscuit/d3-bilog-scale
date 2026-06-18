# D3.js Outlier Visualization Techniques — Research Report

> **Dataset**: 200 small business loans. 84% under $10K, median ~$6K. 10 outliers from $120K–$1.2M.

## Table of Contents

**Scale Transforms**

1. [Log Scale](#log-scale) | **category**: scale-transform | **code_complexity**: low | **distribution_driven**: Function-driven | **library_dependency**: (a) Core d3-scale
2. [Piecewise / Hybrid Scale](#piecewise-hybrid-scale) | **category**: scale-transform | **code_complexity**: medium | **distribution_driven**: Hybrid | **library_dependency**: (a) Core d3-scale -- polylinear support is built into every continuous scale; no…
3. [Power / Square Root Scale](#power-square-root-scale) | **category**: scale-transform | **code_complexity**: low | **distribution_driven**: Function-driven | **library_dependency**: (a) Core d3-scale
4. [Quantile / Rank Transform](#quantile-rank-transform) | **category**: scale-transform | **code_complexity**: low. A single scale-constructor swap: pass the data array as the domain and an N… | **distribution_driven**: Distribution-driven (data-driven) | **library_dependency**: Core d3-scale
5. [Symlog Scale](#symlog-scale) | **category**: scale-transform | **code_complexity**: low | **distribution_driven**: Function-driven | **library_dependency**: (a) Core d3-scale (added in d3-scale 2
6. [d3-scale-break Plugin](#d3-scale-break-plugin) | **category**: scale-transform | **code_complexity**: medium. Higher than a core scale swap because you must hand-tune subdomains and … | **distribution_driven**: Hybrid, leaning function/configuration-driven | **library_dependency**: Plugin dependency (option b)

**Visual Encoding**

7. [Beeswarm / Strip Plot](#beeswarm-strip-plot) | **category**: visual-encoding | **code_complexity**: high — requires running and tuning a force simulation (strength, collide radius,… | **distribution_driven**: data-driven — every individual datum is drawn as a mark; layout is determined by the actual data points (and their collisions), not by a fixed mathematical function | **library_dependency**: Core D3 (d3-force + d3-scale + d3-selection); no external plugin required
8. [Box Plot with Outlier Markers](#box-plot-with-outlier-markers) | **category**: visual-encoding | **code_complexity**: medium. No simulation, but more than a scale swap: compute quantiles + fences, r… | **distribution_driven**: Distribution-driven (data-driven) | **library_dependency**: Core d3-scale + d3-shape/d3-array (d3
9. [ECDF / CCDF](#ecdf-ccdf) | **category**: visual-encoding | **code_complexity**: low — sort, compute cumulative fractions, one d3.line(). No simulation, no KDE, … | **distribution_driven**: data-driven — the curve is the empirical cumulative distribution of the actual sorted observations (step function over the real data) | **library_dependency**: Core D3 only (d3-array, d3-scale, d3-shape)
10. [Raincloud Plot](#raincloud-plot) | **category**: visual-encoding | **code_complexity**: high — three coordinated layers (KDE computation + area path, manual quartile bo… | **distribution_driven**: data-driven — composite of three data-driven layers: a half-violin (KDE of the actual distribution), a box plot (data quartiles), and a jittered strip of the raw points | **library_dependency**: Core D3 if hand-rolled (d3-shape + d3-array + d3-scale), no dedicated plugin — t…
11. [Two-Level Histogram](#two-level-histogram) | **category**: visual-encoding | **code_complexity**: high — drawing is trivial (low), but implementing the arXiv MDL two-level binnin… | **distribution_driven**: data-driven — bin boundaries are derived from the data's own distribution via an MDL (Minimum Description Length) criterion plus a logarithmic split into subsets, rather than a fixed bin width | **library_dependency**: Rendering: core D3 (d3-array d3
12. [Violin Plot](#violin-plot) | **category**: visual-encoding | **code_complexity**: high. No core helper, no simulation, but you must implement the kernel + density… | **distribution_driven**: Distribution-driven (data-driven) | **library_dependency**: Core d3-shape (d3

**Interaction**

13. [Animation-based Reveal](#animation-based-reveal) | **category**: interaction | **code_complexity**: medium (a domain tween plus redraw is more than a one-line scale swap but needs … | **distribution_driven**: function-driven (the animation interpolates between two states - e | **library_dependency**: Core d3-transition + d3-interpolate + d3-ease + d3-scale
14. [Annotation-driven Outlier Callouts](#annotation-driven-outlier-callouts) | **category**: interaction | **code_complexity**: low | **distribution_driven**: Function-driven in mechanism but data-driven in placement: the annotation engine itself is fixed (it just draws callouts at supplied x/y/dx/dy), but which points get a callout is chosen from the actual distribution (the analyst picks the 10 outliers) | **library_dependency**: Plugin
15. [Focus + Context (Overview + Detail)](#focus-context-overview-detail) | **category**: interaction | **code_complexity**: high (multi-chart coordination, brush<->zoom round-tripping, recursion guards vi… | **distribution_driven**: function-driven (the interaction itself is independent of the data distribution; it pairs a full-range context view with a zoomable focus view, and works with any underlying scale - linear, log, symlog | **library_dependency**: Core d3-brush + d3-zoom + d3-dispatch + d3-scale + d3-transition
16. [Linked Brushing](#linked-brushing) | **category**: interaction | **code_complexity**: high (multiple coordinated brushes, single-active-brush management, selected-ID … | **distribution_driven**: function-driven (the brushing/linking mechanism is independent of the data distribution; it selects marks in pixel space and propagates the selected datum IDs to other views | **library_dependency**: Core d3-brush + d3-dispatch + d3-scale + d3-selection
17. [Semantic Zooming](#semantic-zooming) | **category**: interaction | **code_complexity**: high (requires custom per-element update logic, LOD threshold management, and ca… | **distribution_driven**: function-driven (zoom level drives which detail/representation is shown via author-defined thresholds, not via the data's quantiles or ECDF | **library_dependency**: Core d3-zoom + d3-scale + d3-selection (+ d3-transition if you animate the LOD s…

**Layout**

18. [Broken / Discontinuous Axis](#broken-discontinuous-axis) | **category**: layout | **code_complexity**: medium | **distribution_driven**: Data-driven: the break range must be chosen from the actual distribution (e | **library_dependency**: Two routes
19. [Inset / Magnified View](#inset-magnified-view) | **category**: layout | **code_complexity**: medium | **distribution_driven**: Data-driven in placement: the inset's domain is chosen from the data (e | **library_dependency**: Core d3-scale + d3-shape + d3-axis for a static inset; add d3-zoom (and/or d3-br…
20. [Small Multiples (Range Tiers)](#small-multiples-range-tiers) | **category**: layout | **code_complexity**: medium. Higher than a single-scale-swap technique (low) because it requires part… | **distribution_driven**: Hybrid | **library_dependency**: Core d3 only
21. [Winsorization (Cap + Label)](#winsorization-cap-label) | **category**: layout | **code_complexity**: low | **distribution_driven**: Strongly data-driven: the cap is the Nth percentile of the actual distribution (e | **library_dependency**: Core d3 only

---

## Detailed Findings

## Scale Transforms

### Log Scale

**technique_name**

Log Scale

**category**

scale-transform

**distribution_driven**

> Function-driven. Uses a fixed mathematical transform (log base b) independent of the data's actual distribution; the same transform is applied whether the data is skewed or not. No data-derived breakpoints, bins, or quantiles.

**d3_api**

> Core D3 v7. d3.scaleLog([domain], [range]) or d3.scaleLog().domain([d0, d1]).range([r0, r1]).base(10). Chained methods: .base(10) sets logarithm base (default 10, e.g. .base(2) or .base(Math.E)); .clamp(true) clamps out-of-domain values; .nice() extends domain to nice powers; .ticks(count) and .tickFormat(count, specifier) generate log-spaced ticks (typically powers of the base plus subdivisions). Axis: d3.axisBottom(x).ticks(10, '~s'). For loan amounts: d3.scaleLog().domain([1000, 1200000]).range([0, width]).base(10).

**library_dependency**

(a) Core d3-scale. No plugin required. Ships with the standard d3 bundle; zero additional bundle-size or maintenance risk.

**zero_negative_handling**

> FAILS on values <= 0. The domain must not include or cross zero (log(0) = -Infinity, log(negative) = NaN). Domain must be strictly positive (e.g. [1, 1.2e6]) or strictly negative. For loan data containing $0 balances, net-zero, or negative net flows / loss values, scaleLog cannot be used without first shifting/filtering the data, which distorts it. This is its single biggest limitation versus symlog.

**authority_verdict**

> Cleveland, 'The Elements of Graphing Data' (1985/1994): explicitly recommends the logarithm as the first resort for data spanning orders of magnitude -- 'With the logarithm, it is easy to plot and see all of the data. Trends in small values are not hidden. Pattern perception immediately tells us the overall story.' He frames log as the preferred alternative to a scale break, advising scale breaks only when the logarithm 'won't work' (e.g. zeros/negatives), and then a full-panel break over a partial slashed-axis break. Tufte, 'The Visual Display of Quantitative Information' (1983): emphasizes graphical integrity and the Lie Factor; a log axis is honest only if the non-linear scale is clearly labeled, since untrained readers misread distances as linear. Wilkinson, 'The Grammar of Graphics' (1999/2005): treats log as a standard scale transform in the grammar, applied before statistics and aesthetics.

**tradeoffs**

> (1) Honesty: a $1.2M outlier sits only ~2.3x the axis distance of a $6K loan, so visual magnitude is heavily compressed -- accurate to the transform but Lie-Factor-distorting if the reader assumes linearity. Must be labeled clearly. (2) Readability: EXCELLENT for the dense $0-$10K region -- the bottom 84% of loans spread across a wide, readable band instead of a thin sliver. This is exactly the problem log solves best. (3) User comprehension: poorest of the function-driven scales for lay audiences -- non-experts do not intuitively read 'each gridline is 10x'; financial/loan stakeholders may misjudge how much bigger the outliers really are.

**code_complexity**

low

**accessibility_support**

> Scale choice does not change ARIA strategy. Standard D3 chart pattern: role="img" + aria-label on the SVG container; <title>/<desc> linked via aria-labelledby; per-mark <title> or aria-label for focusable marks; tabindex for keyboard navigation. Community-recommended fallback is a visually-hidden <table> mirroring the data (Fossheim, a11ywithlindsey). For log axes specifically, the aria-label / hidden table should state actual dollar values, not log-transformed positions, since screen-reader users cannot perceive the visual compression.

**best_for**

> The default first choice for this dataset (200 loans, 84% < $10K, median ~$6K, 10 outliers to $1.2M) PROVIDED there are no $0 or negative loan values. It spreads the dense sub-$10K cluster into a readable band while still fitting the $1.2M outliers on one panel, exactly Cleveland's recommended treatment. Use it when the audience is financially literate enough to read a 10x gridline. Switch to symlog if any loan can be $0 or negative; switch to a quantile/data-driven scale if you need lay-reader comprehension over mathematical honesty.

**Uncertain fields** (omitted from above)

- observable_urls
- community_reception

---

### Piecewise / Hybrid Scale

**technique_name**

Piecewise / Hybrid Scale

**category**

scale-transform

**distribution_driven**

> Hybrid. The MECHANISM (polylinear continuous scale) is function-driven, but the technique becomes data-driven in practice because the author places the interior domain breakpoints to match the data's distribution (e.g. a breakpoint at $10K to separate the dense cluster from the outliers). If breakpoints are derived from the data (median, percentile, cluster edge) it is effectively distribution-driven; if fixed, it is function-driven.

**d3_api**

> Core D3 v7. Any continuous scale (d3.scaleLinear, scaleLog, scalePow, scaleTime) accepts MORE THAN TWO domain/range values to become polylinear/piecewise: d3.scaleLinear().domain([0, 10000, 1200000]).range([0, 0.6*width, width]). D3 internally performs a BINARY SEARCH over the domain to select the matching segment interpolator, then interpolates within it (domain must be in ascending or descending order; range length must equal domain length). This lets you allocate, e.g., 60% of pixel width to the bottom $0-$10K and 40% to $10K-$1.2M. Repeating values in domain+range can force a constant output region. Verified at d3-wiki Quantitative-Scales and https://d3js.org/d3-scale/linear.

**library_dependency**

> (a) Core d3-scale -- polylinear support is built into every continuous scale; no plugin needed. A purpose-built alternative is the d3-scale-break plugin (https://observablehq.com/@lukewhyte/handling-skewed-data-with-d3-scale-break) which packages this with broken-axis styling, but it has very low adoption (~10 stars) and added maintenance risk versus rolling your own with core polylinear domains.

**zero_negative_handling**

> Depends on the base scale. With scaleLinear segments it handles zero and negatives cleanly (you can place a breakpoint at 0). With a scaleLog base segment it inherits log's failure on <= 0. Most flexible of all options because you choose per-segment behavior -- e.g. a linear segment for the $0-$10K band (handles zeros) plus a compressed segment for outliers.

**authority_verdict**

> Not named by the canonical authorities, but conceptually closest to a SOFT scale break. Cleveland, 'The Elements of Graphing Data' (1985/1994): warns scale breaks 'can be very misleading' and to avoid partial/slashed-axis breaks in favor of full-panel breaks. A piecewise scale that silently compresses a region WITHOUT a visible break gap is exactly the kind of hidden distortion Cleveland cautions against -- it is more honest than a slashed axis only if the change in scale is clearly marked. Tufte (1983): Lie-Factor concern is acute here -- a piecewise axis changes the data-units-per-pixel mid-axis, which can grossly mislead unless explicitly annotated. Wilkinson, 'The Grammar of Graphics' (1999/2005): piecewise/polylinear maps are expressible in the grammar but flagged as needing careful legend/scale communication.

**tradeoffs**

> (1) Honesty: the LEAST honest by default -- the data-units-per-pixel changes across the axis, so equal pixel distances mean different dollar amounts; high Lie-Factor risk unless the breakpoint is visibly annotated. (2) Readability: potentially the BEST for this dataset -- you can deliberately allocate most of the pixel width to the dense $0-$10K region and squeeze the outlier range, giving full control over the readable band that pure log/symlog don't offer. (3) User comprehension: poor-to-moderate -- a hidden change of scale mid-axis is confusing and easily missed; needs an explicit visual break marker, a scale annotation, or a legend to be understood.

**observable_urls**

> https://observablehq.com/@d3/continuous-scales (official; documents that polylinear scales perform a binary search for the segment interpolator). https://d3js.org/d3-scale/linear (official linear-scale docs covering >2 domain values). https://github.com/elcontraption/polylinear-scale (community polylinear helper). https://observablehq.com/@lukewhyte/handling-skewed-data-with-d3-scale-break (d3-scale-break plugin, ~10 stars, purpose-built for skewed financial data, low adoption). https://d3-wiki.readthedocs.io Quantitative-Scales (binary-search interpolation reference).

**code_complexity**

medium

**accessibility_support**

> Scale choice does not change ARIA strategy, but the comprehension risk makes the fallback table MORE important. Standard D3 pattern: role="img" + aria-label on SVG; <title>/<desc> via aria-labelledby; per-mark <title>/aria-label; keyboard tabindex; visually-hidden <table> fallback (Fossheim, a11ywithlindsey). Because the mid-axis scale change is invisible to AT users, the hidden table and aria-labels MUST report raw dollar values and the description should state where/why the scale changes.

**best_for**

> For this dataset it is the technique that gives the MOST direct control: place a domain breakpoint at ~$10K and allocate the majority of pixel width to the bottom 84% of loans, then compress $10K-$1.2M into the remaining width -- so the dense median-$6K cluster is fully readable while the 10 outliers stay visible on one panel. Choose it over log/symlog when you want to dictate exactly how much screen space the main distribution gets and the audience can be given a clear break annotation. Avoid it for audiences who won't notice the scale change, where its honesty cost outweighs its readability gain; in that case prefer a clearly-labeled log scale or an explicit full-panel break (Cleveland).

**Uncertain fields** (omitted from above)

- community_reception

---

### Power / Square Root Scale

**technique_name**

Power / Square Root Scale

**category**

scale-transform

**distribution_driven**

> Function-driven. Applies a fixed power transform y = m*x^k + b (here k = 0.5, square root) regardless of the data's distribution. No data-derived breakpoints or quantiles; the exponent is chosen by the author, not learned from the data.

**d3_api**

> Core D3 v7. d3.scalePow().exponent(0.5).domain([d0, d1]).range([r0, r1]). Shorthand: d3.scaleSqrt(...) is exactly equivalent to d3.scalePow().exponent(0.5). Chained methods: .exponent(k) (any real except 0; default 1 = linear); .domain(), .range(), .clamp(true), .nice(), .ticks(count), .tickFormat(). For loans: d3.scaleSqrt().domain([0, 1200000]).range([0, width]). Commonly used for radius encodings (area-proportional bubbles) but also valid for a moderately compressing axis.

**library_dependency**

(a) Core d3-scale. No plugin. Part of the standard d3 bundle; no extra bundle-size or maintenance risk.

**zero_negative_handling**

> Handles ZERO cleanly (0^0.5 = 0; domain may start at 0, a key advantage over scaleLog). Handles negatives by symmetric extension: D3 multiplies a negative input by -1, applies the power, then negates the output, so the transform is symmetric about zero and does not return NaN. However this symmetric treatment is rarely what financial readers expect, so negatives are 'supported but not clean' -- usable for net flows but easy to misinterpret. Verified at https://d3js.org/d3-scale/pow.

**authority_verdict**

> Less explicitly endorsed than log by the canonical authorities. Cleveland, 'The Elements of Graphing Data' (1985/1994): favors the logarithm as the primary transform for skewed data; power/root transforms are part of the broader Tukey 'ladder of powers' tradition he draws on but are not his headline recommendation for orders-of-magnitude axes. Tufte (1983): graphical-integrity / Lie-Factor caution applies -- a sqrt axis is honest only if clearly labeled. Wilkinson, 'The Grammar of Graphics' (1999/2005): pow is a standard parametric scale transform in the grammar. Widely recommended specifically for sizing marks by AREA (radius = sqrt(value)) so perceived area is proportional to value.

**tradeoffs**

> (1) Honesty: gentler compression than log -- a $1.2M outlier is still dramatically far from $6K (sqrt(1.2M) ~ 1095 vs sqrt(6000) ~ 77, a ~14x ratio), so outliers still dominate the axis far more than under log. Moderately honest about relative magnitude. (2) Readability: only PARTIALLY solves the compression problem -- because outliers are 200x the median, even sqrt leaves the sub-$10K cluster squeezed into the lower portion of the axis; far less effective than log or symlog at opening up the dense region. (3) User comprehension: a sqrt AXIS is unintuitive to lay readers (gridlines are non-linear but not the familiar 10x of log). However sqrt for BUBBLE-AREA sizing is the one context where it is the perceptually correct, expert-endorsed default.

**code_complexity**

low

**accessibility_support**

> Scale choice does not change ARIA strategy. Standard D3 pattern: role="img" + aria-label on SVG; <title>/<desc> via aria-labelledby; per-mark <title>/aria-label; keyboard tabindex; visually-hidden <table> fallback (Fossheim, a11ywithlindsey). The hidden table and labels must report raw dollar values, since the sqrt position is not perceivable to AT users.

**best_for**

> For this dataset, the strongest case is NOT the axis but sizing the 10 outliers as area-proportional bubbles (radius = scaleSqrt(amount)) over a separate categorical/quantile axis, so a $1.2M loan reads as the right relative area rather than an oversized blob. As a sole x-axis transform it underperforms log/symlog here because the 200x outlier ratio still crushes the sub-$10K band. Choose sqrt over log when the data legitimately includes $0 loans and you want a milder, less aggressive compression than log -- but expect outliers still to dominate.

**Uncertain fields** (omitted from above)

- observable_urls
- community_reception

---

### Quantile / Rank Transform

**technique_name**

Quantile / Rank Transform

**category**

scale-transform

**distribution_driven**

> Distribution-driven (data-driven). Thresholds are computed from the actual sorted sample population, not from a fixed mathematical function. Each output band holds an (approximately) equal count of observations, so the encoding adapts to the empirical distribution and is robust to outliers by construction.

**d3_api**

> Core d3-scale. Primary constructor: d3.scaleQuantile().domain(sample).range([...]). The domain is the full array of sample values (not [min,max]); D3 sorts it internally and treats it as a discrete population. The cardinality of range determines the number of quantiles (e.g. a 4-element range yields quartiles). Inspect computed cutpoints with scale.quantiles() (returns range.length - 1 thresholds) and recover the band for a value with scale.invertExtent(rangeValue). Closely related discrete constructors: d3.scaleQuantize() (equal-width domain bins) and d3.scaleThreshold() (manual cutpoints). For a continuous rank/ECDF position rather than discrete bands, compute ranks with d3.rank() (d3 v7.4+) or sort + index, then feed a normalized rank into d3.scaleLinear().

**library_dependency**

Core d3-scale. No plugin required. d3.scaleQuantile, d3.scaleQuantize, d3.scaleThreshold, d3.rank, and d3.quantile all ship in standard D3 v7. Zero added bundle size and no long-term maintenance risk.

**zero_negative_handling**

> Handles zero and negative values cleanly. Because the scale only sorts and ranks the sample, it is sign-agnostic — there is no logarithm or fractional power to be undefined at <=0. Net flows or loss data (negative loan balances) sort into the lowest quantile bands without error.

**tradeoffs**

> (1) Honesty: LOW magnitude fidelity. Equal-count bands deliberately destroy proportional spacing — a $6K loan and a $1.2M loan can sit one band apart, so the reader cannot judge that one is 200x larger. This is honest about ordering/density but actively misleading about magnitude unless labelled. (2) Readability: HIGH for the dense region. The 84% of loans under $10K are spread across multiple bands instead of collapsing into one pixel-thin stripe, so structure inside the cluster becomes visible. (3) User comprehension: LOW-to-MEDIUM for untrained readers. 'Quantile band' / 'percentile rank' is not intuitive; axis ticks are non-linear and unevenly spaced in data units. Best paired with an explicit legend mapping bands to value ranges (via invertExtent).

**code_complexity**

> low. A single scale-constructor swap: pass the data array as the domain and an N-element range. The only added work is building a legend from scale.quantiles()/invertExtent() so readers can decode the bands.

**accessibility_support**

> Inherits standard D3/SVG accessibility patterns; nothing special to the scale. Recommended: role="img" + aria-label on the SVG container, per-mark <title>/aria-labelledby giving the underlying dollar value (not the band index), and a visually-hidden HTML data table as the community-recommended fallback for complex charts. Because the rank transform hides true magnitude, the hidden table is especially important — it should expose real dollar amounts so screen-reader users are not limited to band ordinals.

**best_for**

> Best when the goal is to reveal density and ordering inside the crowded $0-$10K mass (84% of the 200 loans) and you are willing to give up proportional magnitude. Equal-count bands guarantee the 10 outliers ($120K-$1.2M) occupy only the top band(s) and cannot compress the main cluster into an unreadable stripe. Ideal for choropleth-style color encoding of loan size, percentile-rank tables, or any view where 'which percentile is this loan in' matters more than 'how many dollars'. Not the right choice when the audience must compare absolute dollar magnitudes — pair with a labelled legend or prefer symlog if magnitude must be preserved.

**Uncertain fields** (omitted from above)

- authority_verdict
- observable_urls
- community_reception

---

### Symlog Scale

**technique_name**

Symlog Scale

**category**

scale-transform

**distribution_driven**

> Function-driven. Symmetric-log is a fixed transform: linear near zero (within +/- constant) and logarithmic beyond, applied regardless of the data's distribution. The .constant(c) parameter is author-chosen, not data-derived, so it remains function-driven rather than distribution-driven.

**d3_api**

> Core D3 v7. d3.scaleSymlog([domain], [range]) or d3.scaleSymlog().domain([d0, d1]).range([r0, r1]).constant(c). Chained methods: .constant(c) sets the size of the linear region around zero (default 1; larger c widens the near-zero linear band, smaller c narrows it -- verified at https://d3js.org/d3-scale/symlog); .domain(), .range(), .clamp(), .ticks(), .tickFormat(). Internally based on the transform sign(x)*log1p(abs(x/c)). For loans potentially crossing zero: d3.scaleSymlog().domain([-50000, 1200000]).range([0, width]).constant(1000).

**library_dependency**

(a) Core d3-scale (added in d3-scale 2.x / d3 v5+). No plugin required; ships with the standard d3 bundle. No extra bundle-size or maintenance risk.

**zero_negative_handling**

> HANDLES zero and negatives natively -- this is its defining advantage over scaleLog. The linear region around zero (controlled by .constant) means 0 maps cleanly and negative values are symmetric to positives. Ideal for net flows, loss data, or loan balances that can be $0 or negative, where scaleLog fails outright.

**authority_verdict**

> Symlog postdates the canonical print authorities (Cleveland 1985/1994, Tufte 1983, Wilkinson 1999/2005), so none recommend it by name. It directly addresses Cleveland's stated condition ('when the logarithm won't work' -- i.e. data containing zeros/negatives, 'The Elements of Graphing Data'): symlog is the modern transform that lets you keep a log-like view when log is impossible, as an alternative to Cleveland's full-panel scale break. Provenance: introduced by Webber (2013) 'A bi-symmetric log transformation for wide-range data' and ported to D3 by Mike Bostock. Tufte's graphical-integrity caution applies -- the hybrid linear/log scale must be clearly labeled.

**tradeoffs**

> (1) Honesty: like log, it heavily compresses the $1.2M outliers; additionally the kink between the linear and log regions can subtly mislead readers about magnitude near the transition. Requires clear labeling. (2) Readability: strong for the dense region AND uniquely lets a $0 / near-zero cluster sit in a readable linear band rather than being pushed to -Infinity as under log. KNOWN PITFALL: symlog reuses linear-style tick generation, so axes spanning many orders of magnitude can get large ugly gaps or sparse ticks (d3/d3-scale issue #162, 'Nicer symlog ticks?') -- often needs a custom .tickFormat / explicit tick values. (3) User comprehension: the hardest scale for lay readers -- a hybrid linear-near-zero / log-far scale is non-obvious even to many analysts; needs annotation of where the linear region ends.

**observable_urls**

> https://observablehq.com/@angiehjort/understanding-d3-scalesymlog (explains the .constant parameter and the linear region near zero -- the canonical explainer notebook). https://d3js.org/d3-scale/symlog (official docs). https://github.com/d3/d3/blob/main/docs/d3-scale/symlog.md (source docs). https://github.com/d3/d3-scale/issues/162 ('Nicer symlog ticks?' -- documents the tick-gap caveat). https://observablehq.com/@shanfan/d3-scale-cheatsheet (community cheatsheet).

**code_complexity**

low

**accessibility_support**

> Scale choice does not change ARIA strategy. Standard D3 pattern: role="img" + aria-label on SVG; <title>/<desc> via aria-labelledby; per-mark <title>/aria-label; keyboard tabindex; visually-hidden <table> fallback (Fossheim, a11ywithlindsey). Labels/table must report raw dollar values; the hidden table is especially important here because the linear-to-log transition is impossible for AT users to perceive from position alone.

**best_for**

> The best choice for this dataset specifically WHEN loans can be $0 or negative (e.g. net flows, write-offs, loss data) -- it gives the same outlier-taming, dense-region-spreading benefit as log but without failing on non-positive values, placing the cluster of small/zero loans in a readable linear band and the $1.2M outliers in the log tail on one panel. Tune .constant near the boundary of the small-loan cluster (e.g. ~1000) so the sub-$10K mass reads well. If all loans are strictly positive, plain scaleLog is simpler and has cleaner ticks; reach for symlog precisely when zero/negatives rule log out.

**Uncertain fields** (omitted from above)

- community_reception

---

### d3-scale-break Plugin

**technique_name**

d3-scale-break Plugin

**category**

scale-transform

**distribution_driven**

> Hybrid, leaning function/configuration-driven. The break is not derived automatically from the distribution; the developer manually declares subdomains (e.g. [[0,1000],[1000,10000],[10000,100000]]) and the fraction of range each occupies via scope (e.g. [[0,0.25],[0.25,0.75],[0.75,1]]). Within each subdomain a normal continuous (linear) scale applies. So the choice of where to break is informed by the skew, but the scale itself behaves as a piecewise linear function once configured.

**library_dependency**

> Plugin dependency (option b). Requires installing d3-scale-break (npm version ~0.1.11, pre-1.0). Adds bundle weight and, critically, maintenance risk: the repo is at v0.x and effectively unmaintained (last push Jan 2023). It is a thin wrapper over d3-scale concepts but is not part of the official D3 distribution.

**tradeoffs**

> (1) Honesty: LOW-to-MEDIUM. A compressed gap distorts perceived distance between the main cluster and outliers; without a clear break glyph readers misjudge magnitude. (2) Readability: HIGH for the dense region once configured — the whole point is to give the $0-$10K mass most of the pixel range while letting outliers still appear. (3) User comprehension: MEDIUM. A broken axis is a familiar idiom in finance/science, but the non-uniform tick spacing must be visually marked (break symbol) or naive readers misread it.

**code_complexity**

> medium. Higher than a core scale swap because you must hand-tune subdomains and scope, integrate the plugin's bespoke axis helpers, and add a visible break marker yourself. No simulation, but plugin integration plus manual breakpoint design and the maintenance risk of a pre-1.0 dependency push it above 'low'.

**best_for**

> Best when you specifically want to keep a single continuous-looking axis in dollar units yet still fit both the $0-$10K cluster (84% of 200 loans) and the 10 outliers ($120K-$1.2M) on one chart, by compressing the empty gap between ~$10K and $120K. Suits a finance audience comfortable with broken axes. Given the low adoption, unmaintained pre-1.0 status, and authority caution, prefer core alternatives (scaleSymlog for a maintained single-axis option, or scaleQuantile, or a two-panel focus+context layout) unless the explicit broken-axis idiom is a hard requirement.

**Uncertain fields** (omitted from above)

- d3_api
- zero_negative_handling
- authority_verdict
- observable_urls
- community_reception
- accessibility_support

---

## Visual Encoding

### Beeswarm / Strip Plot

**technique_name**

Beeswarm / Strip Plot

**category**

visual-encoding

**distribution_driven**

> data-driven — every individual datum is drawn as a mark; layout is determined by the actual data points (and their collisions), not by a fixed mathematical function. The collision packing reflects the real local density.

**d3_api**

> Core d3-force + d3-scale. Position values are mapped with a continuous scale on one axis, e.g. const x = d3.scaleLog().domain(d3.extent(data, d => d.amount)).range([0, width]) (or scaleLinear). Layout via simulation: d3.forceSimulation(data).force('x', d3.forceX(d => x(d.amount)).strength(1)).force('y', d3.forceY(height/2)).force('collide', d3.forceCollide(radius + 1)).stop(); then for (let i=0;i<120;++i) simulation.tick(); reading d.x / d.y per node. forceCollide(r).radius(r).iterations(n) controls packing. Marks rendered as <circle cx={d.x} cy={d.y} r>. Alternative non-simulation layouts (Harry Stevens 'beeswarm-methods-compared') use a greedy/scan dodge algorithm instead of d3.forceSimulation.

**library_dependency**

> Core D3 (d3-force + d3-scale + d3-selection); no external plugin required. Observable Plot offers the same via its built-in dodge transform (Plot.dot(data, Plot.dodgeY({x:'amount'}))) which removes the hand-rolled simulation entirely.

**zero_negative_handling**

> The beeswarm layout itself is agnostic to sign and handles zero/negative values fine because positions come from whichever positional scale is chosen. The risk is in the underlying axis scale: pairing the beeswarm with d3.scaleLog (common for this skewed loan data) fails on values ≤ 0; scaleLinear or scaleSymlog must be used if zero/negative loan amounts exist.

**tradeoffs**

> Honesty: high — shows every loan, no binning or summarisation, so the 10 outliers are individually visible and not absorbed into a bar. Readability: the dense $0–$10K cluster becomes a thick packed blob; with 200 points and 84% under $10K the main mass packs into a wide band and individual values there are hard to read unless paired with a log/symlog axis. Outliers read clearly as isolated dots far to the right. User comprehension: intuitive for lay audiences ('one dot = one loan'), low encoding-learning cost; the jitter/packing dimension is decorative and can be misread as a second variable by naive viewers.

**code_complexity**

> high — requires running and tuning a force simulation (strength, collide radius, iteration count, stopping the sim before render), plus per-node tick loop. Higher than a single scale swap; the Observable Plot dodge transform reduces it to medium/low.

**accessibility_support**

> Not provided out of the box. Recommended pattern: role='img' + aria-label summary on the SVG container, plus a visually-hidden <table> fallback listing each loan amount (the community-recommended fallback for complex D3 charts). Per-mark <title>/aria-labelledby on each circle is possible but 200 focusable marks is noisy for screen-reader/keyboard users; grouping or a data-table fallback is preferred. Keyboard focusability of individual dots is custom work.

**best_for**

> Best when the audience benefits from seeing all 200 loans individually and the 10 outliers must remain visible as discrete, labelable points rather than being binned away. Strong for storytelling/exploration where 'each loan is a person/business'. For this dataset pair it with a log or symlog x-axis so the 84% under $10K don't collapse into an unreadable packed band while the $120K–$1.2M outliers sit clearly in the tail.

**Uncertain fields** (omitted from above)

- authority_verdict
- observable_urls
- community_reception

---

### Box Plot with Outlier Markers

**technique_name**

Box Plot with Outlier Markers

**category**

visual-encoding

**distribution_driven**

> Distribution-driven (data-driven). All elements are computed from the empirical distribution: Q1, median, Q3 from sample quantiles; whiskers extend to the most extreme observation within Tukey's 1.5xIQR fence; points beyond the fence are drawn individually as outlier marks. The summary adapts to the data rather than to a fixed function.

**d3_api**

> Core D3 (hand-rolled rendering; no plugin required). Statistics: sort the values, then d3.quantile(sorted, 0.25 | 0.5 | 0.75) for Q1/median/Q3; iqr = q3 - q1; Tukey fences = q1 - 1.5*iqr and q3 + 1.5*iqr; whisker ends snap to the nearest in-fence datum (d3.min/d3.max over filtered values, or scan with the fence). Outliers = values outside the fences, drawn as circle marks (svg.append('circle') per outlier, joined by index so they animate across transitions). Scale: d3.scaleLinear() (or d3.scaleSymlog().constant(1) / d3.scaleLog() for skewed dollar axes). Box and whiskers rendered with rect and line elements; axis via d3.axisBottom/axisLeft. Optional plugin: d3fc provides a packaged boxplot series, but the canonical approach is hand-rolled core D3. Observable Plot also offers a native boxX/boxY mark.

**library_dependency**

> Core d3-scale + d3-shape/d3-array (d3.quantile, d3.min, d3.max). Hand-rolled SVG, no external plugin. Optional packaged alternatives: d3fc boxplot series (plugin) or Observable Plot's built-in box mark.

**zero_negative_handling**

> The statistics themselves are sign-agnostic — quantiles, IQR, and Tukey fences are well defined for zero and negative values (e.g. net flows / loss data). The only <=0 risk is the chosen value scale: a d3.scaleLog axis fails at <=0, so use scaleLinear or scaleSymlog for data spanning zero/negatives.

**authority_verdict**

> Strongly endorsed lineage. The box plot is Tukey's own invention ('Exploratory Data Analysis', 1977); the Tukey 1.5xIQR outlier rule is canonical. Cleveland ('The Elements of Graphing Data', 1985/1994) recommends box plots for comparing distributions across groups and praises their data-density and resistance to outliers. Tufte favours the high data-ink efficiency of the box plot and even proposed minimalist 'midgap'/quartile-plot variants (though empirical studies found his reduced variants read less accurately than the standard box plot). Wilkinson ('The Grammar of Graphics') formalizes the box plot as a schema element. Consensus: a trustworthy, authority-blessed summary — with the standard caveat that it hides multimodality (which a violin plot would reveal).

**tradeoffs**

> (1) Honesty: HIGH. Robust summary that explicitly separates the central 50% (the box) from flagged outliers; does not distort magnitude when drawn on an honest axis. (2) Readability: HIGH for summary, but it COLLAPSES the within-cluster detail — you see Q1/median/Q3 of the $0-$10K mass but not its internal shape or whether it is multimodal. (3) User comprehension: MEDIUM. Widely recognized in technical/financial audiences, but lay readers often misread whiskers, the box, and what an outlier dot means; quartiles are not universally understood.

**code_complexity**

> medium. No simulation, but more than a scale swap: compute quantiles + fences, render box/whiskers/median as separate rect+line elements, and data-join the outlier circles. Straightforward but multi-part custom rendering.

**accessibility_support**

> Hand-rolled SVG, so accessibility is opt-in. Recommended: role="img" + aria-label summarizing the five-number summary on the container; per-element <title> on the median line, box (Q1-Q3), whisker ends, and each outlier circle giving the actual dollar value; keyboard-focusable outlier marks (tabindex) so the 10 outliers can be tabbed through. A visually-hidden HTML data table (min, Q1, median, Q3, max, and the explicit list of outlier values) is the recommended fallback for screen readers.

**best_for**

> Best when the audience needs a robust statistical SUMMARY of the 200 loans and the 10 large outliers ($120K-$1.2M) should be shown as individually flagged points rather than allowed to stretch the axis. The Tukey fence will almost certainly classify the $120K-$1.2M loans as outlier dots above a whisker that stops near the top of the $0-$10K cluster (median ~$6K), so the box stays readable while outliers remain visible and labelled. Excellent for group comparisons (e.g. loan size by sector). Weaker if you must reveal the internal shape/multimodality of the dense cluster — pair with or switch to a violin/beeswarm plot for that.

**Uncertain fields** (omitted from above)

- observable_urls
- community_reception

---

### ECDF / CCDF

**technique_name**

ECDF / CCDF

**category**

visual-encoding

**distribution_driven**

> data-driven — the curve is the empirical cumulative distribution of the actual sorted observations (step function over the real data). No binning and no fixed mathematical function; it is purely a function of the data.

**d3_api**

> Core d3-array + d3-scale + d3-shape. Sort and assign cumulative probabilities: const sorted = data.map(d=>d.amount).sort(d3.ascending); points = sorted.map((v,i)=>[v,(i+1)/sorted.length]). Render with d3.line().x(d=>x(d[0])).y(d=>y(d[1])) (use .curve(d3.curveStepAfter) for a true ECDF step). x = d3.scaleLinear or d3.scaleLog for the value axis; y = d3.scaleLinear([0,1]). CCDF: y = 1 - F(x), i.e. (n-i)/n, plotted on log-log axes — x = d3.scaleLog() AND y = d3.scaleLog() — so heavy-tail / power-law behaviour appears as a straight line. Optionally d3.bisector / invert for reading percentiles interactively.

**library_dependency**

Core D3 only (d3-array, d3-scale, d3-shape). No plugin. Trivially expressible in Observable Plot too (Plot.lineY with a cumulative map, or Plot.ecdf-style transform).

**zero_negative_handling**

> The ECDF on linear axes handles zero and negative values without issue (it just sorts). The probability axis is always (0,1]. The only failure is the CCDF-on-log-log variant: log x-axis fails on values ≤ 0 and log y-axis cannot show the F=1 / CCDF=0 endpoints — those points must be dropped or the linear-ECDF form used instead. For strictly-positive loan amounts this is a non-issue on the x-axis.

**authority_verdict**

> Strongest literature endorsement of the four techniques for reading exact outlier values. Cleveland explicitly advocates quantile/ECDF plots (Cleveland 1993 pp.17-20; Visualizing Data 1993; Elements of Graphing Data 1994 pp.136-139) for reading percentiles and exact values directly. Claus Wilke (Fundamentals of Data Visualization, ECDF/QQ chapter) recommends ECDFs for skewed data. Marc Brooker: 'for nearly all purposes in systems design and operations, eCDFs are a better choice than histograms for presenting data to humans' (brooker.co.za, 2022). Wilkinson treats the CDF/quantile function as fundamental in The Grammar of Graphics.

**tradeoffs**

> Honesty: highest of the four — no binning, no smoothing, no area-estimation; every value is exactly on the curve and percentiles are read directly off the y-axis. Readability: the dense $0–$10K region shows as a steep near-vertical rise (84% of probability gained quickly) and the 10 outliers as a long flat tail to $1.2M — both regions readable, and with a log x-axis the lower mass spreads out further. Reading an exact outlier value = trace the point on the curve. User comprehension: the main weakness — cumulative-probability curves are unintuitive to lay audiences (they expect 'how many' bars, not 'fraction ≤ x'); CCDF on log-log is expert-only. Slope encodes density, which must be explained.

**code_complexity**

low — sort, compute cumulative fractions, one d3.line(). No simulation, no KDE, no custom binning. The CCDF log-log variant adds only scale swaps and endpoint filtering (still low/medium).

**accessibility_support**

> Well-suited to accessible fallbacks: role='img' + aria-label stating key percentiles (median, p90, p99, max) on the SVG, plus a visually-hidden <table> of percentile→value pairs (community-recommended fallback) which maps naturally onto the ECDF's own semantics. A single line path is easy to describe; interactive bisector readout can expose values on focus/hover for keyboard users.

**best_for**

> Best when the goal is reading exact outlier values and percentiles precisely — for these 200 loans you can read 'the median is ~$6K, p84 ≈ $10K, and the top 10 stretch to $1.2M' directly off one curve with zero distortion. The flat tail isolates the outliers without compressing the main mass. Use the linear-x ECDF for a business audience; reserve the log-log CCDF for confirming heavy-tail/power-law structure. The most honest, lowest-complexity choice when precision matters more than lay intuitiveness.

**Uncertain fields** (omitted from above)

- observable_urls
- community_reception

---

### Raincloud Plot

**technique_name**

Raincloud Plot

**category**

visual-encoding

**distribution_driven**

> data-driven — composite of three data-driven layers: a half-violin (KDE of the actual distribution), a box plot (data quartiles), and a jittered strip of the raw points. No fixed mathematical transform; every layer reflects the empirical distribution.

**d3_api**

> No single core constructor — it is a hand-rolled composite. Violin half: kernel density estimate then d3.area()/d3.line() with d3.curveBasis over the density; binning historically via d3.histogram()/d3.bin(). Box layer: compute quantiles with d3.quantile(sorted, 0.25/0.5/0.75) and draw rects/lines manually. Strip layer: raw points as <circle> with manual y-jitter (Math.random()) or a beeswarm dodge. Scales: d3.scaleLinear/scaleLog for the value axis, d3.scaleBand or fixed offsets to stack the three layers. In Observable Plot it composes built-in marks: Plot.density/areaY (cloud) + Plot.boxX (rain gauge) + Plot.dot with Plot.dodgeY/jitter (rain).

**library_dependency**

> Core D3 if hand-rolled (d3-shape + d3-array + d3-scale), no dedicated plugin — there is no canonical D3 raincloud package. Most reference implementations live in R/ggplot2 (Cedric Scherer / Allen et al. ggrain/PtitPrince). On the web the path of least resistance is Observable Plot's built-in marks rather than raw D3.

**tradeoffs**

> Honesty: high — combines raw points (no hiding), quartile summary, and full density shape, so it exposes the outlier-vs-tail distinction the bare box plot conceals. Readability: the cloud+box+rain stack needs vertical room; with 200 points and extreme skew the rain layer crowds in the $0–$10K region and the violin's KDE bandwidth choice can over-smooth the tail. Reading exact outlier values is weaker than ECDF. User comprehension: highest cognitive load of the four techniques — three encodings layered together; unfamiliar to non-technical audiences and needs a legend/explanation.

**code_complexity**

> high — three coordinated layers (KDE computation + area path, manual quartile box, jittered strip), shared scales and offsets. Comparable to or above beeswarm. Observable Plot composition lowers it to medium.

**accessibility_support**

> Not built-in and harder than single-mark charts because of three layers. Recommended: role='img' + aria-label describing the distribution (median, quartiles, outlier count) on the SVG, plus a visually-hidden data <table> of raw values (community-recommended fallback). Per-element <title> on box/whisker/strip points is possible but the layered geometry is confusing via keyboard; the hidden-table fallback is the pragmatic route.

**best_for**

> Best as the 'community upgrade path' from a bare box plot when you want to keep the familiar quartile summary but also reveal that the 10 high-value loans are genuine tail mass rather than noise — the strip + violin layers make the outlier-vs-tail distinction explicit. Most valuable for an analytically literate audience comparing a few groups; for a single 200-loan distribution where reading exact outlier values matters, ECDF is stronger.

**Uncertain fields** (omitted from above)

- zero_negative_handling
- authority_verdict
- observable_urls
- community_reception

---

### Two-Level Histogram

**technique_name**

Two-Level Histogram

**category**

visual-encoding

**distribution_driven**

> data-driven — bin boundaries are derived from the data's own distribution via an MDL (Minimum Description Length) criterion plus a logarithmic split into subsets, rather than a fixed bin width. Both the number of bins and their lengths/frequencies are chosen to fit the actual data, so it adapts automatically to outliers and heavy tails.

**library_dependency**

> Rendering: core D3 (d3-array d3.bin + d3-scale + d3-shape) or Observable Plot rectY. Binning: external — the arXiv:2306.05786 algorithm has no reference D3/JS implementation (reference code is in the Khiops/G-Enum ecosystem); you must port the heuristic or precompute thresholds. So effectively core-D3 for drawing but custom code for the data-driven bin edges.

**tradeoffs**

> Honesty: high — MDL-chosen bins avoid the arbitrary-bin-width distortion of ordinary histograms and represent both the dense body and the sparse tail without manual tuning. Readability: the log-split gives fine resolution in the dense $0–$10K body and coarse bins across the $120K–$1.2M tail, so the main distribution is not compressed into one bar and outliers still appear; variable bin widths must be read carefully (area, not height, when widths differ). User comprehension: histograms are the most familiar of the four to lay audiences, but variable-width / log-split bins can mislead viewers who assume equal widths — needs clear axis treatment. Reading exact outlier values is weaker than ECDF.

**code_complexity**

> high — drawing is trivial (low), but implementing the arXiv MDL two-level binning (log-split + per-subset MDL sub-histograms + aggregation) from a paper with no JS reference is the dominant cost. If thresholds are precomputed offline and only d3.bin().thresholds() is used, the D3 side drops to low.

**accessibility_support**

> Standard histogram accessibility applies: role='img' + aria-label summarising the distribution and bin ranges on the SVG, plus a visually-hidden <table> of bin range → count (community-recommended fallback). Per-rect <title>/aria-labelledby with bin bounds and counts works well since bins are discrete and few. Variable bin widths should be stated in the aria description to avoid the equal-width misreading.

**best_for**

> Best when the audience expects a familiar histogram but a fixed-width histogram would crush the $0–$10K body into one bar (because the $1.2M outliers force a huge x-range). The data-driven log-split automatically gives fine bins where 84% of loans sit and coarse bins across the outlier tail, with no parameter tuning — the parameter-light selling point. Choose it over a plain histogram for this skewed data; choose ECDF instead if exact outlier values must be read precisely.

**Uncertain fields** (omitted from above)

- d3_api
- zero_negative_handling
- authority_verdict
- observable_urls
- community_reception

---

### Violin Plot

**technique_name**

Violin Plot

**category**

visual-encoding

**distribution_driven**

> Distribution-driven (data-driven). The shape is an empirical kernel density estimate (KDE) of the sample, mirrored about a central axis. The full continuous density of the data — including multimodality — drives the silhouette, not a fixed function. The only function-like choice is the kernel and its bandwidth, which smooth the estimate.

**d3_api**

> Core D3, hand-rolled (no dedicated violin constructor). Build a KDE helper: a kernel function (commonly Epanechnikov, kernelEpanechnikov(k) = v => Math.abs(v/=k)<=1 ? 0.75*(1-v*v)/k : 0) and a kernelDensityEstimator(kernel, thresholds)(data) that returns [x, density] pairs over thresholds (e.g. x.ticks(40)). Map density to width with a d3.scaleLinear, and render the mirrored silhouette with d3.area() using x0/x1 set symmetrically around the category center (.x0(d => center - widthScale(d[1])).x1(d => center + widthScale(d[1])).y(d => yScale(d[0])).curve(d3.curveCatmullRom or curveBasis)). Value axis via d3.scaleLinear / d3.scaleSymlog. Note: d3.density()/d3.kde() are not real D3 v7 core functions — KDE is hand-rolled; d3-contour provides d3.contourDensity for 2D density but not 1D violins. Often combined with an inner box plot (d3.quantile). Plugin/alternative: Observable Plot has no native violin but density marks exist; d3fc not required.

**library_dependency**

> Core d3-shape (d3.area, curves) + d3-scale + d3-array (d3.max, ticks). The KDE math is written by hand — there is no core d3.kde(). No mandatory plugin. (d3-contour exists for 2D density but is not used for 1D violins.)

**zero_negative_handling**

> The KDE and area rendering are sign-agnostic and work fine with zero and negative values (the density is estimated over whatever value range is present). The only <=0 risk is choosing a log value axis; use scaleLinear or scaleSymlog if the data spans zero/negatives. One subtlety: KDE can smear density slightly below the true minimum (e.g. assign nonzero density to negative dollars when no negative loans exist), which can be visually misleading near a natural zero bound.

**tradeoffs**

> (1) Honesty: MEDIUM. Faithful to distribution shape but bandwidth-dependent — a poor bandwidth invents bumps or oversmooths; smoothed tails can imply impossible values (e.g. below-zero loans); the mirrored symmetry encodes no extra information. (2) Readability: HIGH for showing the SHAPE of the dense $0-$10K mass, including whether it is multimodal — its main advantage over the box plot. (3) User comprehension: LOW for untrained readers. Most lay viewers cannot read a KDE silhouette or know what 'width = density' means; it reads as an abstract blob. Often needs an embedded box plot or annotation to ground it.

**code_complexity**

> high. No core helper, no simulation, but you must implement the kernel + density estimator, choose/tune bandwidth and thresholds, mirror the area symmetrically, optionally overlay a box plot, and handle one violin per category. Most involved of the four techniques here aside from full force layouts.

**accessibility_support**

> Hand-rolled SVG with weak intrinsic accessibility — a density silhouette conveys little to assistive tech. Recommended: role="img" + aria-label describing the distribution shape and key stats on the container; the violin path is hard to make meaningful per-mark, so the visually-hidden HTML data table is the primary, essential fallback (expose quantiles and binned densities, or the raw values). If an inner box plot is overlaid, make its median/quartile lines and outlier dots keyboard-focusable with <title> values.

**best_for**

> Best when the key question about the 200 loans is the SHAPE of the dense sub-$10K mass — for example whether the 84% under $10K is unimodal around the ~$6K median or hides multiple clusters (micro-loans vs. mid loans). A violin reveals that internal structure where a box plot only shows quartiles. The 10 outliers ($120K-$1.2M) appear as a thin, near-flat density tail; on a linear axis that tail can stretch the violin and flatten the interesting region, so pair with scaleSymlog or a clipped/focus axis. Strongest with a reasonably large sample (200 is adequate) and a technical audience; for a general audience prefer a box plot or annotated histogram, or overlay an inner box plot to aid comprehension.

**Uncertain fields** (omitted from above)

- authority_verdict
- observable_urls
- community_reception

---

## Interaction

### Animation-based Reveal

**technique_name**

Animation-based Reveal

**category**

interaction

**distribution_driven**

> function-driven (the animation interpolates between two states - e.g. a full-range domain and a clipped/zoomed domain - using a fixed easing/interpolation function; it does not derive breakpoints from the data's quantiles/ECDF. The start and end domains may themselves be distribution-derived, but the reveal mechanism is functional)

**d3_api**

> Core D3 v7. selection.transition().duration(ms).ease(d3.easeCubicInOut) drives the reveal. To animate a rescale of the value axis you interpolate the scale's DOMAIN: e.g. const i = d3.interpolate(x.domain(), [0, 10000]); then in a transition().tween('domain', () => t => { x.domain(i(t)); redraw(); }) - or use selection.attrTween / .attr with the new positions computed from the transitioned scale. d3-interpolate (d3.interpolate, d3.interpolateNumber, d3.interpolateArray) underlies the smooth domain morph; d3.interpolateZoom can animate a smooth zoom path. d3.transition is bundled in core d3. Common pattern: render at full domain [0, 1200000] (outliers visible), then animate domain.transition to [0, 10000] so the dense band 'opens up' before the viewer's eyes, preserving object constancy.

**library_dependency**

Core d3-transition + d3-interpolate + d3-ease + d3-scale. All bundled in default d3. No plugin.

**zero_negative_handling**

> Agnostic - interpolating a domain works for any numeric range including negatives. The only failure is if an endpoint domain is fed to scaleLog with a <=0 bound; interpolating a log domain through/across zero is also undefined. With scaleLinear or scaleSymlog endpoints, zero/negative are fine.

**tradeoffs**

> (1) Honesty: MEDIUM - if the END state is a clipped domain ([0,$10K]) the outliers leave the frame, which can mislead unless the start state and an annotation make the clipping explicit; the animation itself is honest as long as both endpoints are labeled. Animating a rescale risks implying the outliers 'shrank' rather than were cropped. (2) Readability: HIGH at the end state and the transition aids comprehension of WHAT changed. (3) Comprehension: HIGH for the change-of-state (Heer & Robertson) - motion preserves object constancy and helps the viewer track that the same loans were re-scaled, IF the transition is smooth and not too fast.

**code_complexity**

> medium (a domain tween plus redraw is more than a one-line scale swap but needs no simulation or multi-view coordination; care required to retarget all dependent marks/axes inside the tween and to avoid janky per-frame full re-renders)

**accessibility_support**

> Weak-to-moderate. Motion can harm users with vestibular sensitivity - MUST honor prefers-reduced-motion (skip to end state). Provide role='img' + aria-label describing both states, announce the final state via an ARIA live region, and supply a visually-hidden data table fallback. The animation conveys nothing to screen-reader users, so the end-state semantics and table are essential.

**best_for**

> Best as a guided onboarding/storytelling reveal: open at the honest full range [0,$1.2M] so the viewer registers the 10 outliers, then smoothly animate the domain to [0,$10K] so the 84%/median-$6K mass expands into readability - the motion teaches the viewer that the axis was rescaled, not that data vanished. Excellent for presentations and explanatory pieces; less suited to a static print figure or a free-exploration analyst tool (where focus+context or a quantile/symlog scale gives more control). Pair the clipped end-state with an explicit '10 loans > $10K not shown' annotation to stay honest.

**Uncertain fields** (omitted from above)

- authority_verdict
- observable_urls
- community_reception

---

### Annotation-driven Outlier Callouts

**technique_name**

Annotation-driven Outlier Callouts

**category**

interaction

**distribution_driven**

> Function-driven in mechanism but data-driven in placement: the annotation engine itself is fixed (it just draws callouts at supplied x/y/dx/dy), but which points get a callout is chosen from the actual distribution (the analyst picks the 10 outliers). It does not transform the scale, so the underlying distribution is preserved unaltered.

**d3_api**

> Plugin (d3-annotation / npm package d3-svg-annotation). Core pattern: const makeAnnotations = d3.annotation().type(d3.annotationCalloutCircle).accessors({ x: d => xScale(d.amount), y: d => yScale(d.y) }).annotations(annotationsArray); then svg.append('g').attr('class','annotation-group').call(makeAnnotations). Annotation objects: { note: { title, label, wrap, align, orientation }, x, y, dx, dy, subject: { radius, radiusPadding } for annotationCalloutCircle, or subject: { width, height } for annotationCalloutRect }. annotationCalloutCircle draws a circle around a subject point; annotationCalloutRect draws a bounding rectangle. Other built-ins: annotationLabel, annotationCallout, annotationCalloutElbow, annotationCalloutCurve, annotationXYThreshold, annotationBadge. Annotations are draggable in editMode via .editMode(true). d3.annotationCustomType() extends the set.

**library_dependency**

Plugin. Requires d3-annotation (published as d3-svg-annotation on npm, ~13KB min). Built for d3-v4 but works with d3-v7 since it only consumes d3-selection/d3-drag/d3-dispatch idioms. NOT core d3.

**zero_negative_handling**

> Does not fail on ≤0. The plugin performs no scale transform; it draws callouts at pixel coordinates produced by whatever scale you pass (linear, symlog, etc.). Zero and negative loan values render fine as long as the underlying scale maps them. Honesty/legibility of the cramped region is governed by that scale, not by the annotation layer.

**tradeoffs**

> (1) Honesty: highest of all techniques — nothing is rescaled, capped, or broken, so magnitude perception is undistorted; the outlier truly sits 200x up the axis and the callout merely names it. (2) Readability: does NOT solve the core compression problem on its own — if 84% of loans sit in a $0–$10K band squashed against the axis, callouts on the 10 outliers leave that band unreadable. Best paired with symlog/log/broken-axis. (3) Comprehension: very high — callout-with-label is universally understood by untrained readers; editorial title + value requires no legend.

**code_complexity**

low

**best_for**

> Best as a complement, not a standalone fix. For the 200-loan dataset (84% <$10K, 10 outliers to $1.2M), use annotationCalloutCircle on each of the 10 outliers — atop a symlog or broken-axis base — to attach the literal value ("≥ $120K", "$1.2M") and an editorial note. It is the honest, editorial layer that names extremes; it does NOT decompress the dense sub-$10K band, so it should always sit on a scale/break technique that does.

**Uncertain fields** (omitted from above)

- authority_verdict
- observable_urls
- community_reception
- accessibility_support

---

### Focus + Context (Overview + Detail)

**technique_name**

Focus + Context (Overview + Detail)

**category**

interaction

**distribution_driven**

> function-driven (the interaction itself is independent of the data distribution; it pairs a full-range context view with a zoomable focus view, and works with any underlying scale - linear, log, symlog. It does not adapt binning or scaling to the data the way quantile/ECDF techniques do, though it is most valuable precisely when the distribution is skewed)

**d3_api**

> Core D3 v7. d3.brushX() (or d3.brush()) configured with .extent([[x0,y0],[x1,y1]]).on('brush end', brushed) on the context chart; d3.zoom() configured with .scaleExtent([1, k]).translateExtent([[0,0],[w,h]]).extent(...).on('zoom', zoomed) on the focus chart. Coordination via d3.dispatch('brush','zoom') OR via mutual programmatic invocation: in 'brushed' compute new domain s.map(x.invert) and call focus.transition().call(zoom.transform, d3.zoomIdentity.scale(w/(s[1]-s[0])).translate(-s[0],0)); in 'zoomed' read event.transform, set focus domain via t.rescaleX(x), and move the brush with context.select('.brush').call(brush.move, x.range().map(t.invertX,t)). Guard against recursion using event.sourceEvent / a custom flag. The official @d3/focus-context notebook uses d3.dispatch to keep the two charts in sync.

**library_dependency**

Core d3-brush + d3-zoom + d3-dispatch + d3-scale + d3-transition. No plugin required. All ship in the default d3 bundle.

**zero_negative_handling**

> Interaction-agnostic: handles zero and negative values fine because the brush/zoom operate in pixel/range space and invert through whatever scale is supplied. Failure on <=0 only occurs if the chosen scale is d3.scaleLog(); pairing the focus+context with scaleLinear or scaleSymlog avoids any issue.

**tradeoffs**

> (1) Honesty: HIGH - the context strip always shows the true, undistorted full range including the $1.2M outlier, so magnitude is never misrepresented; the focus view is an honest linear sub-window. (2) Readability: HIGH once interacted - the dense $0-$10K band becomes fully readable after brushing into it, but the default (un-brushed) view still compresses the mass unless an initial brush window is pre-set. (3) Comprehension: MEDIUM - requires the user to discover and perform the brush/zoom interaction; static screenshots and print are degraded; novice users may not realize the context strip is draggable.

**community_reception**

> Very widely referenced; the canonical Bostock 'Brush & Zoom' gist and the official @d3/focus-context notebook are standard teaching examples cited across D3 tutorials and the Observable gallery. Official D3 collection entry shows ~88 likes / 68 forks. Pattern is foundational rather than niche.

**code_complexity**

high (multi-chart coordination, brush<->zoom round-tripping, recursion guards via event.sourceEvent, and transform/domain inversion math make this one of the more error-prone D3 interaction patterns)

**accessibility_support**

> Weak by default. The brush and zoom behaviors are mouse/touch-first; d3-brush is not keyboard-operable out of the box and d3-zoom keyboard support is limited. Recommended remediation: role='img' + aria-label on the SVG, plus a visually-hidden data table fallback (the community-recommended pattern for complex D3 charts per Fossheim and a11ywithlindsey). Per-mark <title>/aria-labelledby helps but does not substitute for keyboard-navigable brushing. Treat as a progressive enhancement over an accessible base table.

**best_for**

> Best when the user needs to BOTH see that the 10 outliers ($120K-$1.2M) exist AND read the dense 84% under $10K - without ever distorting magnitudes. The context strip keeps the $1.2M loan visible and to-scale while the focus pane lets the analyst dial into the $0-$10K mass. Ideal for an interactive dashboard/analyst tool; poor for static reports or a single print figure where no interaction is possible. Consider pre-setting the initial brush to the $0-$10K window so the first paint is already readable.

**Uncertain fields** (omitted from above)

- authority_verdict
- observable_urls

---

### Linked Brushing

**technique_name**

Linked Brushing

**category**

interaction

**distribution_driven**

> function-driven (the brushing/linking mechanism is independent of the data distribution; it selects marks in pixel space and propagates the selected datum IDs to other views. Does not adapt encoding to quantiles/ECDF)

**d3_api**

> Core D3 v7. d3.brush() / d3.brushX() with .extent(...).on('start brush end', brushed) attached to each linked view. On a brush event, read event.selection (= [[x0,y0],[x1,y1]] or [x0,x1] for brushX), invert through that cell's scales to data space, compute the set of selected datum IDs, then broadcast. Synchronization via d3.dispatch('brush'): const dispatch = d3.dispatch('brush'); dispatch.on('brush', selection => updateAllViews(selection)); each view registers a listener and re-styles its marks (opacity/class) by membership in the selected ID set. Clearing: when event.selection is null, dispatch empty selection. The official @d3/brushable-scatterplot-matrix keeps only one active brush at a time and highlights matching points across all cells.

**library_dependency**

> Core d3-brush + d3-dispatch + d3-scale + d3-selection. No plugin. Quadtree (d3-quadtree, also core) is commonly added for fast hit-testing on large/dense selections (Beshai's brushing-with-quadtrees pattern).

**zero_negative_handling**

Agnostic - selection is geometric and inverts through whatever scale each view uses; zero/negative values are fine unless a view uses scaleLog. No special handling needed.

**authority_verdict**

> Becker, R.A. & Cleveland, W.S. 'Brushing Scatterplots' (Technometrics, 1987) is the seminal authority - Cleveland explicitly developed and endorsed brushing as a dynamic-graphics method for multivariate exploration. Shneiderman (1996) subsumes it under 'zoom and filter'. Wilkinson (Grammar of Graphics) treats brushing/linking as a core interaction primitive. Strong canonical backing.

**tradeoffs**

> (1) Honesty: HIGH - linked brushing does not rescale or distort any axis; it overlays selection state on honest views, so magnitude perception is untouched. The outlier-compression problem in the main distribution is NOT solved by brushing alone - it must be paired with a scale or focus technique. (2) Readability: NEUTRAL/INDIRECT - brushing reveals relationships (which low-value loans correlate with which other attributes) rather than fixing the compressed $0-$10K band. (3) Comprehension: MEDIUM - the brush gesture is fairly intuitive, but coordinating multiple views and understanding cross-view highlighting requires some user sophistication; static export loses the interaction.

**code_complexity**

> high (multiple coordinated brushes, single-active-brush management, selected-ID set propagation via dispatch, and per-view restyling; quadtree adds further code. Coordinating N views correctly is error-prone)

**accessibility_support**

> Weak by default - d3-brush is mouse/touch-first and not keyboard-operable out of the box; cross-view highlight state is invisible to AT. Mitigate with role='img' + aria-label per view, ARIA live-region announcements of selection size/summary, focusable marks (tabindex='0') with <title>, and a visually-hidden data table fallback per view. Genuine keyboard parity for brushing requires substantial custom work.

**best_for**

> Best when the question is RELATIONAL rather than just distributional - e.g. 'are the 10 outlier loans concentrated in one industry/region/loan-officer?' Brush the outlier tail in one view and watch which categories light up in linked views. It does NOT by itself decompress the 84%-under-$10K band, so for THIS dataset pair it with a focus+context or symlog/quantile scale on each view. Most valuable in a multi-attribute analyst dashboard; unnecessary for a single univariate loan-size figure.

**Uncertain fields** (omitted from above)

- observable_urls
- community_reception

---

### Semantic Zooming

**technique_name**

Semantic Zooming

**category**

interaction

**distribution_driven**

> function-driven (zoom level drives which detail/representation is shown via author-defined thresholds, not via the data's quantiles or ECDF. The level-of-detail breakpoints are chosen by the developer, so it does not auto-adapt to the distribution the way quantile binning does)

**d3_api**

> Core D3 v7 d3-zoom. d3.zoom().scaleExtent([1, k]).on('zoom', zoomed); inside zoomed you read event.transform (= {k, x, y}) and, instead of applying the transform wholesale via attr('transform', t) (which would be GEOMETRIC zoom), you drive targeted updates: e.g. rescale only position with t.rescaleX(xScale) while holding mark radius/stroke-width constant, and branch on t.k to add/remove detail (show value labels when t.k > threshold, swap aggregated marks for individual marks, etc.). Often combined with d3.scaleLinear() whose domain is recomputed each zoom via t.rescaleX/t.rescaleY. The key distinction from geometric zoom: the domain is NOT permanently rescaled away from its real units - the original scale is preserved and t.rescaleX produces a transient view scale.

**library_dependency**

Core d3-zoom + d3-scale + d3-selection (+ d3-transition if you animate the LOD swaps). No plugin required.

**zero_negative_handling**

> Agnostic - operates in range/pixel space through the supplied scale, so zero and negative values are fine unless the supplied scale is scaleLog. The LOD threshold logic (branching on t.k) is unaffected by data sign.

**tradeoffs**

> (1) Honesty: MEDIUM-HIGH - because the underlying domain is not permanently distorted (rescaleX is transient), magnitudes stay truthful; risk is that aggregated low-zoom representations can hide the outliers if LOD thresholds are poorly chosen. (2) Readability: HIGH at depth - the $0-$10K cluster can be spread out and labeled at high zoom while staying uncluttered at overview. (3) Comprehension: MEDIUM-LOW - the representation CHANGING (not just growing) as you zoom can disorient untrained users; requires discoverable affordances and ideally animated transitions between LOD levels to maintain object constancy.

**code_complexity**

high (requires custom per-element update logic, LOD threshold management, and care to keep stroke/radius constant while rescaling position; more involved than a wholesale transform application)

**accessibility_support**

> Weak by default; d3-zoom has limited keyboard support and the changing representation is hard to convey to AT. Mitigate with role='img' + aria-label, live-region announcements of the current zoom level / detail tier, and a visually-hidden data table fallback containing all rows. Per-mark <title> helps when individual marks appear at high zoom.

**best_for**

> Best when you want a single canvas that shows an honest aggregate overview (e.g. binned counts spanning $0-$1.2M) and, on zoom, dissolves the dense $0-$10K aggregate into individual labeled loans without ever lying about scale. Strong for exploratory analyst tools. Overkill for a static report or when a simple focus+context strip would suffice; the LOD authoring cost is only justified if multiple meaningful detail tiers exist between $6K median and $1.2M outliers.

**Uncertain fields** (omitted from above)

- authority_verdict
- observable_urls
- community_reception

---

## Layout

### Broken / Discontinuous Axis

**technique_name**

Broken / Discontinuous Axis

**category**

layout

**distribution_driven**

> Data-driven: the break range must be chosen from the actual distribution (e.g. the empty gap between the ~$10K main cluster and the $120K–$1.2M outliers). The discontinuity provider literally excludes a data-defined domain interval, so the technique depends on knowing where the gap in the data is.

**d3_api**

> Plugin (@d3fc/d3fc-discontinuous-scale). const scale = fc.scaleDiscontinuous(d3.scaleLinear()).discontinuityProvider(fc.discontinuityRange([10000, 120000])).domain([0, 1200000]).range([height, 0]); Methods: scaleDiscontinuous(wrappedScale) wraps any continuous scale; .discontinuityProvider(provider); providers are fc.discontinuityIdentity() (no gaps), fc.discontinuityRange([a,b],[c,d]) (exclude domain intervals — numeric or date), fc.discontinuitySkipWeekends() (financial origin: removes Sat/Sun from a time scale; UTC variant exists). Adapted methods: scale(v), scale.invert(v), .domain(), .ticks([count]), .nice(), .copy(). CAVEAT (verified in d3fc docs): ticks falling inside a discontinuity are clamped to the upper boundary, so multiple ticks in one gap overlap — manual .tickValues([...]) is recommended around the break. For Cleveland's PREFERRED full-panel break, d3fc is not even needed: render two separate <g> panels (sub-$10K and >$120K), each with its own d3.scaleLinear(), separated by a gap — hand-rolled, no plugin.

**library_dependency**

> Two routes. (a) Partial/slashed single-axis break: plugin @d3fc/d3fc-discontinuous-scale (and @d3fc/d3fc-axis for ticks). (b) Cleveland's recommended FULL break (two stacked/side-by-side panels): core d3-scale + d3-axis only, no plugin — just two scales and two axis groups with a visible gap. d3fc adds bundle weight and is financial-origin.

**zero_negative_handling**

> Inherits from the wrapped scale. With scaleLinear underneath, zero and negatives render fine. The d3fc docs give no explicit ≤0 guidance — behavior depends entirely on the wrapped scale's capabilities. A two-panel full break with linear scales also handles ≤0 without issue. (If you wrap scaleLog you reintroduce the log ≤0 failure.)

**authority_verdict**

> Cleveland ("The Elements of Graphing Data", 1985/1994) is explicit and central here: PREFER a FULL scale break (two distinct panels) over a partial/slashed single-axis break. With a full break, "pattern recognition tells that there are two distinct groups of data, and table look-up tells us what they are." He warns subtle/slashed breaks are easy to miss and create "a basic conflict between the two basic operations of graph interpretation" (pattern perception implies comparability while magnitudes differ wildly). Even full breaks risk fooling pattern perception because panel width does not encode data range. Cleveland's overall preference for highly skewed data is a LOGARITHMIC scale (lets pattern perception and table look-up complement each other); axis breaks are a fallback. Summarized at tomhopper.me/2010/08/30/graphing-highly-skewed-data. Tufte generally disfavors axis tricks that distort the data-to-ink mapping. d3/d3 issue #2229 ("Break scale option") shows the maintainers declined to add breaks to core, pushing the community to d3fc.

**tradeoffs**

> (1) Honesty: a partial/slashed break is the LEAST honest option — it visually compresses a huge magnitude jump into a thin slash, fooling pattern perception (Cleveland's explicit warning). A full two-panel break is more honest because the discontinuity is unmistakable. Neither preserves true proportional spacing. (2) Readability: excellent — the dense $0–$10K band gets the full lower panel/lower axis segment, finally legible, while the $120K–$1.2M outliers get their own region. This is the technique's main strength. (3) Comprehension: full break = good (two clearly labeled panels read as 'two groups'); slashed break = risky (untrained readers miss the slash and misjudge magnitudes).

**code_complexity**

medium

**best_for**

> Strong fit for this dataset because the data has a genuine empty gap (~$10K up to $120K with nothing between). Use Cleveland's FULL two-panel break: a wide lower panel for the 84% under $10K (now fully readable, median ~$6K legible) and a narrower upper panel for the 10 outliers to $1.2M, with an unmistakable gap. Prefer this over a slashed single-axis break. If the audience can read logs, Cleveland would still rank a single log axis above any break.

**Uncertain fields** (omitted from above)

- observable_urls
- community_reception
- accessibility_support

---

### Inset / Magnified View

**technique_name**

Inset / Magnified View

**category**

layout

**distribution_driven**

> Data-driven in placement: the inset's domain is chosen from the data (e.g. zoom the $0–$10K region where 84% of loans sit), but the rendering mechanism (a second scale over a sub-range) is function-driven. It is essentially focus+context / overview+detail: the full range stays in the main panel and a magnified sub-range is drawn in an inset.

**d3_api**

> Core d3 (optionally + d3-zoom). Two common implementations: (a) Static inset — a nested <g transform="translate(...)"> (or a nested <svg x y width height>) containing its own d3.scaleLinear().domain([0, 10000]).range(...) and its own d3.axisBottom; the main panel keeps domain [0, 1200000]. (b) Interactive inset — d3.zoom().scaleExtent([1, k]).on('zoom', (e) => insetScale.domain(e.transform.rescaleY(baseScale).domain())) applied to the inset panel, redrawing marks via the rescaled scale. Sync between panels via d3.dispatch (as in the official focus+context example). A brush (d3.brushX/brushY) on the main panel can drive the inset's domain. nested <svg> auto-clips; a <g> needs an explicit clipPath (defs > clipPath > rect, referenced via clip-path).

**library_dependency**

> Core d3-scale + d3-shape + d3-axis for a static inset; add d3-zoom (and/or d3-brush, d3-dispatch) for an interactive/synced inset. No third-party plugin required. d3-zoom is core D3, so even the interactive version is plugin-free.

**zero_negative_handling**

> Does not fail on ≤0. Both panels typically use scaleLinear, which accepts zero and negatives. The inset simply re-scopes the domain; no log transform is involved unless you choose one. d3-zoom operates in pixel/transform space and is value-sign agnostic.

**tradeoffs**

> (1) Honesty: high — the main panel shows undistorted full-range magnitudes (the $1.2M outlier really is far up), and the inset is clearly a magnified sub-region, not a rescale of reality. No magnitude lie. (2) Readability: excellent for BOTH regions simultaneously — the inset decompresses the $0–$10K band (median ~$6K legible) while the overview retains the outliers; this is its key advantage over a single transformed axis. (3) Comprehension: moderate — untrained readers must understand two coordinate systems and the inset's different scale; a connector/leader showing which region the inset magnifies, plus distinct axis labels, is needed to avoid misreading the inset as part of the main axis.

**code_complexity**

medium

**best_for**

> Excellent fit when you want to keep the true outliers visible AND read the dense main band without any axis distortion. For 200 loans (84% under $10K, median ~$6K, 10 outliers to $1.2M): main overview panel spans $0–$1.2M (outliers honestly far up top), with an inset magnifying $0–$10K so the bulk distribution is fully legible — optionally a brush on the overview drives the inset domain. Outperforms Winsorization on honesty (no capping) and outperforms a single log/symlog axis when the audience cannot read transformed scales. Cost is higher implementation effort and two coordinate systems to explain.

**Uncertain fields** (omitted from above)

- authority_verdict
- observable_urls
- community_reception
- accessibility_support

---

### Small Multiples (Range Tiers)

**technique_name**

Small Multiples (Range Tiers)

**category**

layout

**distribution_driven**

> Hybrid. The rendering primitive (a shared d3.scaleLinear() repeated across panels) is function-driven, but the choice of tier boundaries (e.g. $0–$10K, $10K–$120K, $120K–$1.2M) is data-driven: the cut points are derived from the actual distribution's gaps/quantiles to give each density regime its own readable panel. Cleveland's canonical full-panel break is explicitly distribution-driven in its split logic.

**library_dependency**

> Core d3 only. Built from d3-scale (scaleLinear, scaleBand), d3-axis, d3-selection, and optionally d3-array (group/bin) — no plugin required. Alternatively achievable as a near one-liner with Observable Plot's built-in faceting (fx/fy channels), which trades a heavier dependency for far less code.

**zero_negative_handling**

> Fully safe on ≤0. The technique sits on d3.scaleLinear(), which handles zero and negative domains without issue (unlike scaleLog, which fails on ≤0). Negative net-flow loans can occupy their own dedicated tier/panel with a domain spanning negatives. This is a key robustness advantage over log-based outlier handling.

**authority_verdict**

> Strongly endorsed by the canonical authorities. Cleveland (The Elements of Graphing Data, 1985/1994) explicitly recommends the FULL-PANEL scale break — two (or more) entirely separate side-by-side plots — over the 'slashed-axis' / partial-axis break, because the full break lets pattern recognition see two distinct data groups while table-lookup recovers exact values, avoiding the perceptual conflict the slash creates. Small multiples / range tiers are this full-panel break taken to its logical conclusion. Tufte (The Visual Display of Quantitative Information, 1983; Envisioning Information, 1990) heavily champions small multiples as among the highest-information, most honest comparative designs ('at the heart of visual reasoning'). Wilkinson (The Grammar of Graphics) formalises the same idea as faceting/trellising via the facet operator. Consistent with Cleveland's preference for separate panels over a single distorting axis transform.

**tradeoffs**

> (1) Honesty — HIGHEST among outlier techniques when each tier keeps a linear scale: no magnitude is distorted within a panel; the eye is never asked to mentally undo a log/symlog warp. The one honesty caveat is that DIFFERENT per-tier x-domains can mislead a reader who doesn't check the (clearly labelled) axis of each panel into thinking the $1.2M outlier panel and the $6K-median panel share a width — axis labels and explicit tier captions mitigate this. (2) Readability — EXCELLENT: the dense $0–$10K region gets its own panel and full horizontal width, so the 84% mass is no longer compressed into an unreadable band; outliers get a separate, breathing panel. (3) User comprehension — GOOD for general audiences: 'here are three views, one per size band' is intuitive and needs no statistical literacy, unlike log/symlog axes. Main cost is screen real estate (n panels) and the cognitive step of reading per-panel axes.

**code_complexity**

> medium. Higher than a single-scale-swap technique (low) because it requires partitioning data into tiers, laying out and coordinating multiple panels/SVGs, and rendering an axis per panel — but it needs no force simulation or plugin. In Observable Plot (fx/fy faceting) the effort drops toward low; in hand-rolled D3 it is squarely medium.

**accessibility_support**

> Strong potential but manual in raw D3. Recommended pattern: role="img" + aria-label on each panel's <svg> stating its tier and range (e.g. 'Loans $0–$10K, 168 of 200'); a single visually-hidden <table> (the community-recommended fallback) listing each loan amount and its tier serves all panels at once; group panels in a container with role="group" / aria-labelledby tying to a heading. Per-mark <title> for individual loans. Observable Plot auto-generates an ariaLabel/ariaDescription on the SVG and supports per-mark aria options but does not emit a full data table by default. Keyboard focusability of marks must be added explicitly (tabindex). References: https://fossheim.io/writing/posts/accessible-dataviz-d3-intro/ and https://www.a11ywithlindsey.com/blog/accessibility-d3-bar-charts/.

**best_for**

> An excellent default for this dataset. Split into ~3 range tiers — e.g. $0–$10K (the 84%, median ~$6K), a mid band $10K–$120K, and an outlier panel $120K–$1.2M (the 10 outliers) — each on its own linear axis. This is exactly Cleveland's full-panel break and keeps the dense low band fully readable while showing the $1.2M outliers honestly without log distortion. Outperforms log/symlog when the audience is non-technical and magnitude honesty matters, and outperforms a slashed/broken single axis (Cleveland's explicit warning). Weaker than a single chart when screen space is tight or when the precise continuous position of every point across the full $0–$1.2M range must be compared in one view; in that case pair it with a beeswarm or focus+context.

**Uncertain fields** (omitted from above)

- d3_api
- observable_urls
- community_reception

---

### Winsorization (Cap + Label)

**technique_name**

Winsorization (Cap + Label)

**category**

layout

**distribution_driven**

> Strongly data-driven: the cap is the Nth percentile of the actual distribution (e.g. 95th or 98th percentile via d3.quantile), so the technique is computed directly from the data's empirical quantiles. Values above the cap are pinned to the cap and the original magnitude is shown only as a text label ("≥ $X").

**d3_api**

> Hand-rolled (core d3 only — no plugin). Compute cap: const sorted = data.map(d => d.amount).sort(d3.ascending); const cap = d3.quantile(sorted, 0.95); (or d3.quantileSorted). Then a normal linear scale to the cap: const y = d3.scaleLinear().domain([0, cap]).range([height, 0]); Plot each point at y(Math.min(d.amount, cap)). For capped points add a label: d3.format('$,.0f')(cap) prefixed with '≥', e.g. text = '≥ ' + d3.format('$.2s')(cap). Optionally clamp the scale with .clamp(true) so any stray value pins to the cap. d3.format('$,.2s') gives '$1.2M'-style abbreviations. No special constructor — it is d3.quantile + d3.scaleLinear + manual labeling of the capped marks.

**library_dependency**

> Core d3 only. Uses d3-array (d3.quantile / d3.quantileSorted), d3-scale (scaleLinear with optional .clamp(true)), and d3-format for the label. No plugin, no extra bundle weight, lowest long-term maintenance risk.

**zero_negative_handling**

> Does not fail on ≤0. d3.quantile and scaleLinear both accept zero and negatives. Winsorizing the upper tail leaves small/zero values untouched. For loss data you could also Winsorize the lower tail at e.g. the 2nd percentile. Unlike scaleLog there is no domain restriction.

**tradeoffs**

> (1) Honesty: the weakest dimension — capping visually relocates a $1.2M loan to the ~$10K cap line, collapsing 100x of magnitude; honesty depends entirely on the "≥ $X" label being read and understood. Without the label it is actively misleading. (2) Readability: excellent — the 84% under $10K occupy the full axis at native resolution; median ~$6K and the bulk shape are perfectly legible because the outliers no longer stretch the domain. (3) Comprehension: mixed — capping is intuitive ("everything above this is lumped at the top") but readers may not register that the top marks represent wildly different true values unless each is individually labeled; a single shared cap label risks implying the outliers are equal.

**code_complexity**

low

**best_for**

> Good when the priority is reading the main distribution and the exact outlier magnitudes are secondary. For 200 loans with 84% under $10K and only 10 outliers, cap at ~the 95th percentile (just above $10K), clamp the scale, and label each capped outlier '≥ $10K' with its true value in a tooltip/table. Outperforms log/symlog when the audience cannot read transformed axes and you want the sub-$10K shape at full linear resolution. Weaker than a full-panel break for HONESTLY conveying how extreme the outliers are; always pair with explicit per-outlier value labels.

**Uncertain fields** (omitted from above)

- authority_verdict
- observable_urls
- community_reception
- accessibility_support

---
