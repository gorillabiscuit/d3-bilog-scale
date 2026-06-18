# Prompt 01 — Initial Research

**Goal**: Map the full solution space before committing to any implementation — authorities, D3 APIs, community exemplars, and novel approaches for outlier-heavy distributions.

---

I'm building a series of five interactive D3.js visualizations that each take a different approach to the same problem: displaying a financial dataset where extreme outliers distort the scale for the majority of data points.

The dataset: 200 small business loans. 84% are under $10,000. The median is ~$6,000. But 10 loans range from $120K to $1.2M. A naive linear scale compresses the majority into a thin unreadable band.

Research the following:

1. ESTABLISHED TECHNIQUES FOR OUTLIER-HEAVY DISTRIBUTIONS
- What do Tufte, Cleveland, Wilkinson, and other data viz authorities recommend for this specific problem?
- What are the standard statistical approaches: log transforms, Winsorization, broken axes, box plots, violin plots?
- What are the known tradeoffs of each (readability, honesty, user comprehension)?

2. D3.js-SPECIFIC IMPLEMENTATIONS
- Find Observable notebooks, D3 bl.ocks, and GitHub repos that demonstrate outlier handling in practice.
- What D3 scale functions are relevant? d3.scaleLog, d3.scalePow, d3.scaleSymlog, custom piecewise scales?
- Are there D3 examples of focus+context, semantic zooming, or linked brushing specifically for outlier distributions?

3. LESS COMMON OR NOVEL APPROACHES
- Asymmetric scales (linear below a threshold, log above)
- Inset/magnified views
- Animation-based approaches (zoom to reveal detail)
- Beeswarm / strip plots where encoding handles outliers differently
- Small multiples (separate charts for different ranges)

4. WHAT THE D3 COMMUNITY CONSIDERS HIGH QUALITY
- What makes an Observable notebook stand out? Code style, annotation, interaction patterns, transitions?
- What are the current D3 best practices (v7+)? Especially: enter/update/exit vs join, responsive patterns, accessibility.
- Examples of D3 notebooks or projects that are widely referenced as exemplary.

I need specific URLs, specific technique names, specific D3 function references. Not general advice.

---

**What it was trying to achieve**: Establish an authoritative, cited knowledge base of every viable technique before writing a single line of D3, so implementation choices are defensible and the article can explain why each approach was (or wasn't) selected.
