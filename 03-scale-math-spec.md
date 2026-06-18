# Scale Math Specification

## The mapping function

Given a value `v` in the data domain `[dMin, dMax]`, the scale maps it to a pixel position `p` in the range `[rMin, rMax]`.

The domain is split into three regions by two breakpoints `bL` (left) and `bR` (right):

```
Region 1 (left log):    dMin ≤ v < bL
Region 2 (linear):      bL ≤ v ≤ bR
Region 3 (right log):   bR < v ≤ dMax
```

Each region gets a proportion of the total pixel budget:

```
Total pixels: W = rMax - rMin
Left log pixels:  wL = W * pL        (e.g., pL = 0.15)
Linear pixels:    wM = W * pM        (e.g., pM = 0.60)
Right log pixels: wR = W * pR        (e.g., pR = 0.25)
Where: pL + pM + pR = 1
```

The pixel proportions are NOT hardcoded. They're derived from the data density and the domain span of each region. More on this below.

## Region-specific transforms

### Region 1: Left log tail (dMin to bL)

```
scale_left(v) = rMin + wL * (log(v) - log(dMin)) / (log(bL) - log(dMin))
```

This maps `dMin → rMin` and `bL → rMin + wL`. Log base doesn't matter because it cancels in the ratio.

For inversion:
```
invert_left(p) = exp(log(dMin) + (p - rMin) / wL * (log(bL) - log(dMin)))
```

### Region 2: Linear middle (bL to bR)

```
scale_middle(v) = rMin + wL + wM * (v - bL) / (bR - bL)
```

This maps `bL → rMin + wL` and `bR → rMin + wL + wM`.

For inversion:
```
invert_middle(p) = bL + (p - rMin - wL) / wM * (bR - bL)
```

### Region 3: Right log tail (bR to dMax)

```
scale_right(v) = rMin + wL + wM + wR * (log(v) - log(bR)) / (log(dMax) - log(bR))
```

This maps `bR → rMin + wL + wM` and `dMax → rMax`.

For inversion:
```
invert_right(p) = exp(log(bR) + (p - rMin - wL - wM) / wR * (log(dMax) - log(bR)))
```

## Boundary continuity proof

At the left boundary (v = bL):
- From Region 1: `rMin + wL * (log(bL) - log(dMin)) / (log(bL) - log(dMin)) = rMin + wL`
- From Region 2: `rMin + wL + wM * (bL - bL) / (bR - bL) = rMin + wL` ✓

At the right boundary (v = bR):
- From Region 2: `rMin + wL + wM * (bR - bL) / (bR - bL) = rMin + wL + wM`
- From Region 3: `rMin + wL + wM + wR * (log(bR) - log(bR)) / (log(dMax) - log(bR)) = rMin + wL + wM` ✓

The scale is C0 continuous (values match at boundaries). It is NOT C1 continuous (the derivative has discontinuities at bL and bR because the transform type changes). This is acceptable and actually desirable: the visual "kink" at the boundary, combined with the vertical reference lines, signals to the reader that the encoding changes there.

## Monotonicity proof

Each region is individually monotonic:
- Region 1: `log` is monotonically increasing, and the linear rescaling preserves monotonicity.
- Region 2: Linear, trivially monotonic.
- Region 3: Same as Region 1.

The ranges are adjacent and non-overlapping:
- Region 1: [rMin, rMin + wL]
- Region 2: [rMin + wL, rMin + wL + wM]
- Region 3: [rMin + wL + wM, rMax]

Therefore the composite function is monotonically increasing over the full domain. ✓

## Breakpoint detection

### Method 1: IQR-based (default, simplest)

```
Q1 = percentile(data, 25)
Q3 = percentile(data, 75)
IQR = Q3 - Q1
bL = Q1 - 1.5 * IQR    // Tukey's lower fence
bR = Q3 + 1.5 * IQR    // Tukey's upper fence
```

Clamp to data extent:
```
bL = max(bL, dMin)   // if no low outliers, bL = dMin (left log region vanishes)
bR = min(bR, dMax)   // if no high outliers, bR = dMax (right log region vanishes)
```

This is the box plot definition of "outlier". Values outside the fences are outliers and get log compression.

### Method 2: Percentile-based

```
bL = percentile(data, p)      // e.g., p = 10
bR = percentile(data, 100-p)  // e.g., 100-p = 90
```

Simple, predictable, but doesn't adapt to the actual distribution shape.

### Method 3: Density-based (kernel density estimation)

1. Compute KDE of the data
2. Find the peak of the density curve (the mode)
3. Walk left from the peak until density drops below a threshold (e.g., 10% of peak density) → bL
4. Walk right from the peak until density drops below the threshold → bR

More sophisticated, adapts to the actual cluster shape. But computationally heavier and the threshold is a tuning parameter.

### Method 4: Jenks natural breaks

Optimal 3-class classification. Minimises within-class variance. The two class boundaries become bL and bR.

Computationally expensive (O(n²k) for k classes), but produces the most "natural" breaks. Could precompute during `.data()` call.

### Recommendation

Start with IQR-based (Method 1). It's well-understood, parameter-free, and aligns with the box plot mental model. If a dataset exposes a weakness, add percentile-based as a fallback. Density and Jenks are stretch goals.

## Pixel allocation

How much of the total width each region gets. This is NOT simply proportional to the data count in each region (that would give the tails almost nothing, defeating the purpose).

### Strategy: Balanced allocation with density weighting

```
// Raw allocation: each region gets a base amount plus a density bonus
baseAlloc = 1/3   // each region starts with equal share

// Count points in each region
nL = count of points where v < bL
nM = count of points where bL ≤ v ≤ bR
nR = count of points where v > bR
nTotal = nL + nM + nR

// Density bonus: regions with more points get proportionally more space
densityL = nL / nTotal
densityM = nM / nTotal
densityR = nR / nTotal

// Blend: 50% equal + 50% density-weighted
alpha = 0.5
pL = alpha * baseAlloc + (1 - alpha) * densityL
pM = alpha * baseAlloc + (1 - alpha) * densityM
pR = alpha * baseAlloc + (1 - alpha) * densityR

// Normalise to sum to 1
total = pL + pM + pR
pL /= total
pM /= total
pR /= total
```

With typical data (80% in middle, 10% each tail):
- pL = 0.5 * 0.333 + 0.5 * 0.10 = 0.217
- pM = 0.5 * 0.333 + 0.5 * 0.80 = 0.567
- pR = 0.5 * 0.333 + 0.5 * 0.10 = 0.217

This gives the tails ~22% of the width each (enough to see outliers) while the middle still gets the majority (~57%).

The `alpha` parameter controls the tradeoff. `alpha = 1.0` gives equal thirds. `alpha = 0.0` gives pure density weighting (tails get almost nothing). `alpha = 0.5` is a reasonable default.

### Edge case: empty regions

If a region has zero data points (e.g., no left outliers):
- Set its pixel allocation to 0
- Redistribute to remaining regions
- The scale degrades to a 2-region (log-linear or linear-log) or pure linear scale

## Interactive expansion

When the user hovers over a compressed (log) region, that region expands while the others contract.

### State machine

```
Default state:    [wL, wM, wR] computed from data as above
Left expanded:    [wL_exp, wM_shrunk, wR]    where wL_exp = wL * expandFactor
Right expanded:   [wL, wM_shrunk, wR_exp]    where wR_exp = wR * expandFactor
```

### Expansion formula

```
expandFactor = 2.5   // the hovered region grows to 2.5x its default width

// When left tail is hovered:
wL_exp = wL * expandFactor
excess = wL_exp - wL
wM_shrunk = wM - excess     // steal from the middle
// wR stays the same

// Guard: middle can't shrink below a minimum
minMiddle = W * 0.15        // at least 15% of total width
wM_shrunk = max(wM_shrunk, minMiddle)
wL_exp = W - wM_shrunk - wR // recalculate if clamped
```

### Transition

Animate between states over ~300ms using d3.transition. During transition, the sub-scales are rebuilt with interpolated pixel allocations.

```
// t goes from 0 (default) to 1 (fully expanded)
wL_t = wL + t * (wL_exp - wL)
wM_t = wM + t * (wM_shrunk - wM)
```

Points move smoothly because the mapping function is continuous and the pixel allocations change smoothly.

### Object constancy

Every data point has a stable identity (its data index or a unique key). During expansion:
- Points in the expanding region spread apart (easier to read)
- Points in the contracting region squeeze together (acceptable because that's the dense region with small value differences)
- Points in the unaffected region stay put

D3's `.join()` with key functions handles this naturally.

## Tick generation

Mixed-region tick generation is non-trivial. Each region needs appropriate ticks:

### Left log tail
Use D3's log scale tick algorithm: powers of 10 plus subdivisions (1, 2, 5 at each decade).
```
leftTicks = d3.scaleLog().domain([dMin, bL]).ticks()
```

### Linear middle
Use D3's linear scale tick algorithm.
```
middleTicks = d3.scaleLinear().domain([bL, bR]).ticks(middleTickCount)
```

Where `middleTickCount` is proportional to the middle's pixel width.

### Right log tail
Same as left log tail.
```
rightTicks = d3.scaleLog().domain([bR, dMax]).ticks()
```

### Deduplication
If bL or bR appear in multiple region tick arrays, deduplicate. The boundary values should appear exactly once.

### Density control
Total tick count should respect the pixel width. Rule of thumb: one tick per 60-80 pixels. Distribute the tick budget proportionally to each region's pixel allocation.

## Compression indicator lines

Vertical lines at each log step in the tail regions. These make the compression visible.

For the left tail, draw a vertical line at each value where `log(v)` is an integer (i.e., at powers of 10, or powers of whatever base the log uses). Where lines are close together, the scale is giving generous space. Where lines are far apart, it's compressing aggressively.

For the right tail, same approach.

The linear middle gets no compression lines (it's not compressed).

These lines are purely visual. They don't affect the scale math.
