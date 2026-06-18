# The Adaptive Piecewise Scale: A New D3 Scale Type for Two-Sided Outlier Distributions

## The problem

You have a dataset where values cluster tightly in one region but extreme outliers exist on BOTH ends. A linear scale crushes the majority into a narrow band while giving most of the axis to empty space. A log scale helps the long-tail end but makes the short-tail end worse. There is no off-the-shelf D3 scale that handles this.

### The canonical example: peer-to-peer lending LTV ratios

Loan-to-Value (LTV) measures how much collateral backs a loan. In peer-to-peer lending markets:

- **The dense cluster (80%+ of loans):** LTV between 40% and 80%. This is where most lending happens. Differences here matter: a 45% LTV loan is meaningfully different from a 75% LTV loan in terms of risk.
- **The left tail:** LTV as low as 5%. These are heavily overcollateralised loans: someone put up 20x the collateral needed. Uncommon but real.
- **The right tail:** LTV as high as 5000% or more. These are massively undercollateralised loans, representing extreme risk. The borrower put up 2% of the loan value as collateral.

The Y-axis is APR (annual percentage rate), which lets us see whether the market prices these extreme LTV positions differently.

### Why existing scales fail

| Scale | Left tail (5%) | Dense middle (40-80%) | Right tail (5000%) | Verdict |
|-------|---------------|----------------------|-------------------|---------|
| Linear | Decent spacing | Cramped but readable | Crushes 80-5000 into a sliver; rest is empty | Broken |
| Log | Overly expanded | Acceptable | Well-compressed | Helps right, hurts left |
| Symlog | Helps near zero | OK | OK | Designed for zero-crossing, not cluster+tails |
| Power (sqrt) | Slightly better | OK | Still too compressed on right | Half-measure |

None of them adapt to where the data actually is.

## The solution: adaptive piecewise scale

A scale with three regions, each using the encoding that works best for that part of the data:

```
|--LOG--|----LINEAR----|--LOG--|
  left      dense         right
  tail      cluster       tail
```

### Region 1: Left log tail
Values below the dense cluster (e.g., 5% to 40% LTV). Logarithmic compression fits this wide range into a manageable strip while preserving the ability to distinguish between, say, a 5% and a 15% LTV loan.

### Region 2: Linear middle
The dense cluster (e.g., 40% to 80% LTV). Linear encoding gives every value proportional space, which is what you want when small differences matter and the range is manageable.

### Region 3: Right log tail
Values above the dense cluster (e.g., 80% to 5000%+ LTV). Logarithmic compression handles the extreme range, with each order of magnitude getting equal visual space.

### Data-driven breakpoints
The boundaries between regions are derived from the data, not hardcoded. Options to evaluate:
- Percentile-based (P10/P90 or P5/P95)
- Density-based (kernel density estimation to find cluster edges)
- IQR-based (Q1 - 1.5*IQR and Q3 + 1.5*IQR)
- Gap detection (natural breaks / Jenks)

### Visual honesty: compression indicators
Vertical reference lines mark each log step in the tail regions. Where lines are dense, the scale is stretched. Where they're sparse, it's compressed. The viewer can see at a glance that the ends are being compressed and by how much. No deception.

### Interactive expansion
Hovering over a compressed (log) region expands it, giving the user enough pixels to inspect individual outliers and read their values. The linear middle contracts proportionally to make room. This is the focus+context pattern applied to a single axis, similar in spirit to Furnas's fisheye views and Spence & Apperley's bifocal display, but with structured (not continuous) distortion.

## What this project produces

### Three charts in one article

1. **Naive linear scale** - Illustrates the problem. Most data crushed into a narrow band, axis dominated by empty space. "This is what you get if you don't think about it."

2. **Log scale** - Shows why the traditional "answer" for outliers fails when outliers exist on both ends. Fixes the right tail, breaks the left tail. "The standard solution only works for one-sided problems."

3. **Adaptive piecewise scale** - The centrepiece. A new scale type that adapts to where the data actually is. Linear where precision matters, logarithmic where compression is needed, with honest visual indicators and interactive expansion. "Here's what you build when you need to solve both ends."

### The reusable scale
The core contribution is not just the chart but the scale itself, implemented as a reusable D3 scale following community conventions: `scale(value)`, `scale.invert(pixel)`, `scale.domain()`, `scale.range()`, `scale.ticks()`, `scale.copy()`. Published as a standalone module that others can import.

## Quality target

Observable notebook submission quality. This means:
- Clean, readable, well-commented code
- Smooth transitions and responsive interactions
- Works across screen sizes
- Handles edge cases gracefully
- Accompanied by clear explanation of the technique and when to use it
- The scale is a reusable, importable module, not inline spaghetti

## Test datasets

Five datasets to prove robustness:

1. **Baseline** - No outliers. Dense cluster only (40-80% LTV). Scale should degrade gracefully to near-linear.
2. **Left-skewed** - Low outliers only (5-40% + cluster). Single log tail on left.
3. **Right-skewed** - High outliers only (cluster + 80-5000%). Single log tail on right.
4. **Both tails** - The canonical case. Outliers on both ends.
5. **Extreme stress test** - Outliers spanning 0.1% to 50,000% with a tight cluster at 55-65%. Maximum dynamic range.

## Data source

TBD. Options:
- **NFTfi on-chain loans** (public blockchain data, peer-to-peer lending, real LTV ratios). All data is public and verifiable on-chain. Can be framed as "peer-to-peer lending" without focusing on NFT/crypto aspects.
- **Synthetic data modeled on real distributions** as a fallback, clearly labeled as such.
- Need to confirm a real, citable data source before building.

## Audience

Data visualisation practitioners, D3 developers, design engineers, Observable community, and hiring managers evaluating design-engineering hybrid skills.
