# 05 — Observable premium-submission rubric

> so the chart as it was, was not ready for deployment to observable. lets make a list of things that someone like mike bostock would care about for a premium submission, and then evaluate our code against that set of requirements.
>
> Our objective here is reusable, friendly code, with parameters for tweaking easily exposed. following their set patterns. Using d3 methods and patterns in all cases where possible

**What it was trying to achieve:** shift the codebase from "app-internal module" to "library API" — build an explicit rubric of d3-scale contract items and Observable reusable-chart conventions, audit against it, then fix in priority order (accessors → exposed parameters → margins → docs → scale contract completeness).
