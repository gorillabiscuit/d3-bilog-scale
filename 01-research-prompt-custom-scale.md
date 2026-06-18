# Research Prompt: Adaptive Piecewise Scale for Two-Sided Outlier Distributions

Run this as a `/research` session in Claude Code.

```
I'm building a new D3.js scale type for datasets with extreme outliers on BOTH ends of the distribution. The canonical example: peer-to-peer lending data where LTV (loan-to-value) ratios cluster at 40-80% but have outliers at 5% on the low end and 5000%+ on the high end.

The scale has three regions:
- LEFT TAIL: logarithmic compression for values below the dense cluster
- MIDDLE: linear scale covering the dense region (where 80%+ of data sits)
- RIGHT TAIL: logarithmic compression for values above the dense cluster

The breakpoints between regions are DATA-DERIVED (not hardcoded). The log regions adapt their base/spacing to the actual data range in each tail.

Interactive behavior: hovering over a compressed (log) region expands it while contracting the middle, giving the user enough pixels to inspect outliers without leaving the single chart.

Visual indicators: vertical reference lines at each log step make the compression visible and honest.

## Research the following:

### 1. PRIOR ART — Distortion-Based Visualization
- Furnas (1986) "Generalized Fisheye Views" — what is the mathematical formulation? How does degree-of-interest (DOI) work? How is it different from what I'm describing?
- Spence & Apperley (1982) "Bifocal Displays" — the original split-focus concept. How does it handle the transition between focus and context regions?
- Sarkar & Brown (1994) "Graphical Fisheye Views" — extensions to Furnas, specifically for 2D data.
- Leung & Apperley (1994) "A Review and Taxonomy of Distortion-Oriented Presentation Techniques" — what taxonomy categories does my scale fall into?
- Bostock's d3-fisheye plugin (archived) — how did it implement continuous distortion? What was the API? Why was it archived?
- Any papers or implementations that specifically combine LOG compression with INTERACTIVE EXPANSION on a single axis.

### 2. D3 SCALE ARCHITECTURE
- How does d3-scale work internally? What is the interface a custom scale must implement? (scale(value), scale.invert(pixel), scale.domain(), scale.range(), scale.ticks(), scale.tickFormat(), scale.copy(), scale.clamp())
- How do existing custom scales (d3-scale-break, d3fc-discontinuous-scale) extend the D3 scale interface?
- What is the correct way to build a reusable D3 scale that follows community conventions and could be published as a standalone module?
- How does D3 v7's scale architecture differ from v4/v5? Any breaking changes relevant to custom scales?

### 3. MATHEMATICAL FOUNDATIONS
- How should breakpoints between the linear and log regions be calculated from data? Options to evaluate:
  - Percentile-based (e.g., P5 and P95 as breakpoints)
  - Density-based (kernel density estimation to find the dense cluster edges)
  - Gap detection (find natural gaps in the distribution)
  - Interquartile range-based (IQR * multiplier to define "normal" range)
- How should the log regions handle different magnitudes on each side? (Left tail might span 5%-40%, right tail might span 80%-5000%)
- Should the transition between linear and log be smooth (C1 continuous) or a hard break? What are the visual and mathematical implications of each?
- How do you ensure the scale is monotonic and invertible (critical for D3 interaction)?

### 4. INTERACTIVE EXPANSION MECHANICS
- When the user hovers over a compressed region, how should the expansion work?
  - Continuous (lens follows cursor, like fisheye)?
  - Discrete (click/hover on a region and it expands to a fixed width)?
  - Animated transition between states?
- How much should the compressed region expand vs how much should the middle contract? Is there a perceptual rule for this?
- How to maintain object constancy during expansion (points shouldn't jump or disappear)?
- What happens at the boundary between expanding and contracting regions?
- Are there examples of this specific interaction pattern (expand-on-hover within a single axis) in any D3 or web visualization?

### 5. OBSERVABLE NOTEBOOK STANDARDS
- What makes an Observable notebook "featured" or "trending"? What do the most-forked D3 notebooks have in common?
- What is the expected code style, documentation level, and interactivity for a high-quality Observable contribution?
- Should the scale be a standalone importable module or inline in the notebook?
- How do Observable's reactive cells work with D3 transitions and hover interactions?

### 6. TESTING AND ROBUSTNESS
- What edge cases should a custom scale handle? (Empty data, single point, all points identical, negative values, zero, very large ranges, very small ranges)
- What testing framework is standard for D3 plugins? (tape, vitest, jest?)
- How do existing D3 scale tests work? What do they test for? (Monotonicity, invertibility, domain/range consistency, tick generation)

Be specific. I want papers (with titles and years), code repos (with URLs), D3 API references, and mathematical formulations where relevant. If something doesn't exist, say so.
```
