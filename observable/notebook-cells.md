# Observable notebook — paste-ready cells

Paste each cell below into a new cell in the Observable editor, **in order, top to bottom**.
Cell type: `md` cells go into Markdown cells, `js` cells into JavaScript cells.

---

## Cell 1 (md)

```md
# Adaptive piecewise scale — keeping outliers on screen without crushing the data

Most financial data is lumpy: the bulk of the values bunch into a narrow band, then a handful of outliers run two or three orders of magnitude past them. On a **linear** scale the cluster collapses into an unreadable sliver. On a **log** scale the cluster's internal structure distorts, and zero is unreachable.

`scaleAdaptive` splits the axis into three regions — a logarithmic tail on either side of a **linear focus window** — and allocates pixels so both the cluster and the outliers stay readable. The tail slope is solved so it *matches the window's slope at the joint*: the transition is seamless, not a broken axis.

**Try it:** drag the window body to pan · drag a handle to resize · click a tail section (or press ←/→) to travel onto it · double-click to reset.
```

---

## Cell 2 (js)

```js
viewof windowFraction = Inputs.range([0.05, 1], { value: 0.5, step: 0.01, label: "Linear window coverage" })
```

---

## Cell 3 (js)

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
  return node;
}
```

---

## Cell 4 (js)

```js
mutable windowState = ({})
```

---

## Cell 5 (md)

```md
## The dataset

A frozen snapshot of NYC's rolling property-sales feed (data.cityofnewyork.us), captured 2026-06-29 — real transactions, not synthetic. It has exactly the shape the scale exists for: $0/$1 nominal deed transfers sit at one extreme, a $168M hotel sale at the other, and the bulk of ordinary residential and small-commercial sales cluster in between. Swap in your own data — the chart takes accessors (`x`, `y`, `label`), so any array of objects works.
```

---

## Cell 6 (js)

```js
sales = d3.csvParse(salesCSV, (d) => ({
  price: +d.x,
  perSqFt: +d.y,
  address: d.label,
  neighbourhood: d.meta,
}))
```

---

## Cell 7 (js)

```js
salesCSV = "x,y,label,meta\n540000,29.582557247726527,\"745 East 6th Street, 1b\",Alphabet City · Rentals - Walkup Apartments\n8600000,442.88804202286536,208 East 7th Street,Alphabet City · Rentals - Walkup Apartments\n4665000,1401.7427884615386,191 East 7 Street,Alphabet City · Rentals - Walkup Apartments\n280000,40.72727272727273,\"510 East 5th Street, 9\",Alphabet City · Rentals - Walkup Apartments\n8800000,1228.0212112754675,207 East 4 Street,Alphabet City · Rentals - Walkup Apartments\n4000000,572.2460658082975,327 East 10 Street,Alphabet City · Rentals - Walkup Apartments\n13000000,454.22781271837874,183 Avenue C,Alphabet City · Rentals - Elevator Apartments\n16700000,383.73161764705884,176 East 3 Street,Alphabet City · Rentals - Elevator Apartments\n8685245,767.9261715296198,204 Avenue A,Alphabet City · Rentals - Elevator Apartments\n597997,52.87329796640142,\"204 Avenue A, 3a\",Alphabet City · Rentals - Elevator Apartments\n112250000,1015.5613860490365,\"250 East Houston Street, 1\",Alphabet City · Special Condo Billing Lots\n3550000,509.325681492109,703 East 6 Street,Alphabet City · Office Buildings\n5000000,1183.7121212121212,195 East 3 Street,Alphabet City · Theatres\n4775000,1419.8632173654476,304 West 18th Street,Chelsea · One Family Dwellings\n13100000,2980.6598407281003,344 W 22 Street,Chelsea · One Family Dwellings\n13500000,4437.869822485207,348 West 22 Street,Chelsea · One Family Dwellings\n11600000,1486.2267777065983,217 West 20 Street,Chelsea · One Family Dwellings\n7650000,2273.402674591382,204 West 21st Street,Chelsea · One Family Dwellings\n10600000,1578.5554728220402,224 West 22nd Street,Chelsea · One Family Dwellings\n14999999,1667.2222963209958,150 West 15th Street,Chelsea · One Family Dwellings\n4999999,1025.6408205128205,443 West 19th Street,Chelsea · Two Family Dwellings\n4500000,1339.2857142857142,447 West 24th,Chelsea · Two Family Dwellings\n7800000,1846.590909090909,343 West 19 Street,Chelsea · Two Family Dwellings\n10600000,1152.1739130434783,313 West 20 Street,Chelsea · Two Family Dwellings\n7500000,1704.5454545454545,125 West 15th Street,Chelsea · Three Family Dwellings\n5750000,809.8591549295775,446 West 19th Street,Chelsea · Rentals - Walkup Apartments\n9250000,1159.1478696741854,410 West 22nd Street,Chelsea · Rentals - Walkup Apartments\n10,0.0009402914903620122,246 10th Avenue,Chelsea · Rentals - Walkup Apartments\n10,0.001035625517812759,248 10th Avenue,Chelsea · Rentals - Walkup Apartments\n6650000,1209.090909090909,331 West 19 Street,Chelsea · Rentals - Walkup Apartments\n16625000,1539.351851851852,205 8 Avenue,Chelsea · Rentals - Walkup Apartments\n16625000,1539.351851851852,207 8 Avenue,Chelsea · Rentals - Walkup Apartments\n5000000,874.1258741258741,356 West 21st Street,Chelsea · Rentals - Walkup Apartments\n5400000,1200,217 West 15 Street,Chelsea · Rentals - Walkup Apartments\n45500,3.3886944216876445,534 West 29,Chelsea · Rentals - Elevator Apartments\n20000000,1047.1204188481674,448-450 West 19th Street,Chelsea · Rentals - Elevator Apartments\n242500,20.815450643776824,\"411 West 24th Street, 11e\",Chelsea · Rentals - Elevator Apartments\n8500000,414.7150663544106,313-315 West 21 Street,Chelsea · Rentals - Elevator Apartments\n12500000,991.3553810770085,135 West 24th Street,Chelsea · Rentals - Elevator Apartments\n21000000,2720.559657986786,58-60 Ninth Ave,Chelsea · Rentals - 4-10 Unit\n350000,105.10510510510511,210 7 Avenue,Chelsea · Rentals - 4-10 Unit\n46181250,837.5120146533433,541 West 21 Street,Chelsea · Office Buildings\n3250000,91.29213483146067,\"127 West 24th Street, 2\",Chelsea · Office Buildings\n7100000,614.7186147186147,131 West 14 Street,Chelsea · Store Buildings\n168618594,1089.182970312379,113-117 West 24 Street,Chelsea · Luxury Hotels\n25150000,727.6777964238181,550 West 25 Street,Chelsea · Commercial Garages"
```

---

## Cell 8 (md)

```md
## The scale

`scaleAdaptive` implements the full d3 continuous-scale contract — `domain`, `range`, `ticks`, `tickFormat`, `nice`, `clamp`, `unknown`, `invert`, `copy` — so it drops straight into `d3.axisBottom` or anything else that expects a scale. Four invariants hold in every configuration:

1. **Monotonicity** — `scale(a) < scale(b)` whenever `a < b`.
2. **Invertibility** — `scale.invert(scale(v)) ≈ v`.
3. **Boundary continuity** — the pixel at a region boundary is identical from either side; the symlog constant is solved (bisection) so the tail's slope matches the linear window's at the joint.
4. **Graceful degradation** — no outliers → a plain linear scale; outliers on one side → one tail.

Custom methods: `.data(values)` (breakpoint detection), `.breakpointMethod('iqr' | 'log-iqr' | 'percentile' | 'quantile')`, `.window(fraction)`, `.linearDomain()` / `.linearRange()` / `.focusDomain()` (window placement), `.regions()`, `.windowBounds()`.
```

---

## Cell 9 (js)

```js
scaleAdaptive = {
  function solveSymlogConstant(A, S, T) {
    if (!(S > 0) || !(A > 0) || !(T > 0)) return 1;
    if (T <= A / S) return S; // window shallower than the tail average → near-linear tail
    const slopeAt = C => A / (C * Math.log1p(S / C));
    let lo = S * 1e-9, hi = S * 1e9; // slopeAt(lo) ≫ T, slopeAt(hi) ≈ A/S < T
    for (let i = 0; i < 80; i++) {
      const mid = Math.sqrt(lo * hi); // C spans many orders of magnitude
      if (slopeAt(mid) > T) lo = mid; else hi = mid;
    }
    return Math.sqrt(lo * hi);
  }

  function symlogTail(boundary, extreme, pBoundary, pExtreme, windowSlope) {
    const span    = Math.abs(extreme - boundary) || 1;
    const outward = Math.sign(extreme - boundary) || 1; // +1 right tail, −1 left tail
    const base    = d3.scaleSymlog().domain([0, span]).range([pBoundary, pExtreme]);
    base.constant(solveSymlogConstant(Math.abs(pExtreme - pBoundary), span, windowSlope));

    const scale      = x => base(outward * (x - boundary)); // feed distance from the boundary
    scale.invert     = px => boundary + outward * base.invert(px);
    scale.ticks      = n => base.ticks(n).map(d => boundary + outward * d);
    scale.tickFormat = (n, s) => base.tickFormat(n, s);
    // domain/range are fixed at construction — this scale IS the pair (boundary, extreme) anchored
    // to (pBoundary, pExtreme); reconfiguring it in place would silently invalidate windowSlope and
    // the boundary-continuity guarantee the parent scale relies on. Throw on the setter form rather
    // than accepting arguments and quietly ignoring them — call copy() (or build a fresh tail) for a
    // scale anchored elsewhere.
    scale.domain = function (d) {
      if (arguments.length) throw new Error('symlogTail: domain is fixed at construction; use copy() or build a new tail');
      return outward > 0 ? [boundary, extreme] : [extreme, boundary];
    };
    scale.range = function (r) {
      if (arguments.length) throw new Error('symlogTail: range is fixed at construction; use copy() or build a new tail');
      return outward > 0 ? [pBoundary, pExtreme] : [pExtreme, pBoundary];
    };
    scale.copy       = () => symlogTail(boundary, extreme, pBoundary, pExtreme, windowSlope);
    return scale;
  }

  function scaleAdaptive(domain, range) {
    let _domain = [1, 100];
    let _range = [0, 1];
    let _data = [];
    let _window = 0.5; // slider fraction [0, 1]
    let _clamp = false;
    let _method = 'iqr'; // breakpoint detection method ('iqr' or 'quantile')
    let _unknown; // scale(NaN/null/undefined) result — d3 convention, set via scale.unknown()

    // Manual overrides for domain & range boundaries (null = auto-detect)
    let _xLoOverride = null;
    let _xHiOverride = null;
    let _r1Override = null;
    let _r2Override = null;
    // When true (set only via focusDomain), rebuild() skips the windowCap unit-shift so the linear
    // window can sit exactly on an explicit range — the "travel onto a log section" gesture. Every
    // linearDomain() call (pan/drag, auto window) clears it, so interaction stays on the capped path.
    let _focusUncapped = false;

    // Internal scales
    let leftScale, midScale, rightScale;
    let currentXLo, currentXHi;
    let currentR1, currentR2;
    let hasLeft = false, hasRight = false;
    let tickPool = [];

    // The outer bound on the linear window — applied to BOTH the auto/default placement and to
    // interaction (pan, handle drag). On multi-decade positive data it sits 2% of the log span in
    // from each extreme, so the window always leaves a thin log-tail on each side and can never
    // flatten the cluster: because the window can never reach an extreme, a tail can never vanish, so
    // the tail-collapse "snap" is structurally impossible. The buffer is kept small (2%) so the
    // window can pan almost to the edge — the residual padding is barely visible. Compact or
    // zero-crossing data returns the full domain, so the scale still degrades cleanly to linear.
    // Exposed via scale.windowBounds() so interaction code clamps to it.
    function windowCap() {
      const [xMin, xMax] = _domain;
      if (xMin > 0 && Math.log10(xMax / xMin) > 1.5) {
        const tf = Math.pow(xMax / xMin, 0.02);
        return [xMin * tf, xMax / tf];
      }
      return [xMin, xMax];
    }

    function rebuild() {
      const [xMin, xMax] = _domain;
      const [rMin, rMax] = _range;
      const totalPixels = rMax - rMin;

      if (xMin >= xMax || totalPixels <= 0) {
        const s = d3.scaleLinear().domain(_domain).range(_range);
        leftScale = midScale = rightScale = s;
        currentXLo = xMin; currentXHi = xMax;
        currentR1 = rMin; currentR2 = rMax;
        hasLeft = hasRight = false;
        tickPool = s.ticks(10);
        return;
      }

      // Determine domain boundaries (xLo, xHi)
      let lo, hi;
      const isOverride = _xLoOverride != null && _xHiOverride != null;
      if (isOverride) {
        lo = _xLoOverride;
        hi = _xHiOverride;
      } else if (_data.length >= 2) {
        if (_method === 'iqr') {
          const { left, right } = detectBreakpoints(_data, 'iqr');
          lo = left;
          hi = right;
        } else if (_method === 'quantile') {
          const { xLo, xHi } = windowQuantile(_data, _window);
          lo = xLo;
          hi = xHi;
        } else {
          const { left, right } = detectBreakpoints(_data, _method);
          lo = left;
          hi = right;
        }
      } else {
        lo = xMin + (xMax - xMin) * 0.25;
        hi = xMin + (xMax - xMin) * 0.75;
      }

      // Cap the window into [floor, ceil] by shifting it as a UNIT (preserving width). Clamping
      // the two edges independently would collapse a window panned entirely past a bound to zero
      // width — the cause of the "$73.4M – $73.4M, linear $0" bug. The cap applies to dragged and
      // auto windows alike, so neither can spread far enough to flatten the cluster / vanish a tail.
      // The focusDomain() "travel" gesture deliberately opts out (_focusUncapped) so the window can
      // sit exactly on a log section's range — there the previously-focused data becomes the tail,
      // which is the point. Boundaries stay valid: the L134-135 clamp keeps them inside [xMin,xMax].
      if (!_focusUncapped) {
        const [floor, ceil] = windowCap();
        const width = Math.max(0, hi - lo);
        if (hi > ceil)  { hi = ceil;  lo = ceil - width; }
        if (lo < floor) { lo = floor; hi = Math.min(ceil, floor + width); }
      }

      // Whether each tail is present. A tail collapsed to (almost) nothing is treated as absent, so
      // dragging an edge to a data extreme doesn't leave a degenerate "log ×0.0" sliver. For positive
      // data the test is ratio-based: a left log tail from xMin to a slightly larger value spans tiny
      // LINEAR width but is a real, visible log region, so a linear tolerance would wrongly dismiss it
      // on multi-decade data (e.g. earthquake energy, where the cluster sits right at the minimum). A
      // small linear fraction is the fallback when the domain starts at or crosses zero.
      const tailTol = (xMax - xMin) * 1e-8;
      const TAIL_RATIO = 1.01; // a positive tail exists once it spans >1% of the extreme, ratio-wise
      hasLeft  = xMin > 0 ? lo / xMin > TAIL_RATIO : lo > xMin + tailTol;
      hasRight = xMax > 0 ? xMax / hi > TAIL_RATIO : hi < xMax - tailTol;

      // Clamp to prevent out-of-bounds or zero-width linear region
      const eps = (xMax - xMin) * 1e-9;
      currentXLo = hasLeft ? Math.max(xMin + eps, Math.min(lo, xMax - 2 * eps)) : xMin;
      currentXHi = hasRight ? Math.min(xMax - eps, Math.max(hi, xMin + 2 * eps)) : xMax;

      if (currentXLo >= currentXHi) {
        const s = d3.scaleLinear().domain([xMin, xMax]).range([rMin, rMax]);
        leftScale = midScale = rightScale = s;
        currentR1 = rMin; currentR2 = rMax;
        hasLeft = hasRight = false;
        tickPool = s.ticks(10);
        return;
      }

      // Determine range boundaries (r1, r2)
      let p1, p2;
      if (_r1Override != null && _r2Override != null) {
        // Honor the user's dragged position unconditionally. When a tail is absent the window
        // stays exactly where the user left it; the empty space beside it stays blank rather
        // than snapping the window to the chart edge. The degenerate tail scale that rebuild()
        // creates below for an absent tail is guarded by hasLeft/hasRight in scale()/invert(),
        // so it is never actually called.
        p1 = _r1Override;
        p2 = _r2Override;
      } else {
        const qLo = hasLeft ? Math.max(0, 0.5 - _window / 2) : 0;
        const qHi = hasRight ? Math.min(1, 0.5 + _window / 2) : 1;
        const wL = hasLeft ? totalPixels * qLo : 0;
        const wR = hasRight ? totalPixels * (1 - qHi) : 0;
        p1 = rMin + wL;
        p2 = rMax - wR;
      }

      // Reserve a minimum pixel width for any tail that exists, so a present tail keeps a consistent,
      // visible sliver instead of collapsing toward zero pixels as a pan nears an extreme. The window
      // cap guarantees the window can never actually reach xMin/xMax on multi-decade data, so a tail
      // never vanishes (hasLeft/hasRight stay true) and this reserve never has to "release" — there is
      // no flip, so holding a full (untapered) reserve keeps the tail width steady right up to the edge
      // with no snap. Fit the linear region INTO the post-reserve band, preserving its pixel width where
      // it fits and shifting it inward to make room — reserving each edge independently could let the
      // two reserves cross and invert the region (p1 > p2) on wide charts.
      const minTail = totalPixels * 0.02;
      const loBound = hasLeft  ? rMin + minTail : rMin;
      const hiBound = hasRight ? rMax - minTail : rMax;
      const linW = Math.min(p2 - p1, hiBound - loBound);
      p1 = Math.max(loBound, Math.min(p1, hiBound - linW));
      p2 = p1 + linW;

      currentR1 = p1;
      currentR2 = p2;

      const windowSlope = (p2 - p1) / (currentXHi - currentXLo);

      // Build sub-scales
      leftScale  = symlogTail(currentXLo, xMin, p1, rMin, windowSlope);
      midScale   = d3.scaleLinear().domain([currentXLo, currentXHi]).range([p1, p2]);
      rightScale = symlogTail(currentXHi, xMax, p2, rMax, windowSlope);

      // Rebuild candidate pool for stable ticks. Built in MAGNITUDE space (|v|) and mirrored to
      // both signs so negative and zero-crossing domains get the same log-spaced "nice" candidates
      // a positive-only domain gets — the log tail scale (symlogTail) is itself sign-symmetric
      // (distance from the boundary), so its tick pool should be too. Candidates outside the actual
      // domain are dropped by the range check below.
      const set = new Set();
      const magMax = Math.max(Math.abs(xMin), Math.abs(xMax));
      if (magMax > 0) {
        const magMin = xMin > 0 || xMax < 0
          ? Math.min(Math.abs(xMin), Math.abs(xMax))  // one-sided domain: real inner bound
          : Math.max(1e-9, magMax * 1e-7);            // zero-crossing: no natural inner bound
        d3.scaleLog().domain([Math.max(magMin, 1e-9), magMax]).ticks(100).forEach(v => {
          if (v >= xMin && v <= xMax) set.add(v);
          if (-v >= xMin && -v <= xMax) set.add(-v);
        });
      }
      d3.scaleLinear().domain([xMin, xMax]).ticks(100).forEach(v => { if (v !== 0) set.add(v); });
      tickPool = [...set];
    }

    function scale(v) {
      if (v == null || Number.isNaN(v = +v)) return _unknown;
      if (_clamp) v = Math.max(_domain[0], Math.min(_domain[1], v));
      if (hasLeft && v <= currentXLo) return leftScale(v);
      if (hasRight && v >= currentXHi) return rightScale(v);
      return midScale(v);
    }

    scale.invert = function (p) {
      // The pixel input is always clamped to range (independent of _clamp, which governs
      // domain-value clamping in scale()). Interaction code feeds raw pointer pixels here;
      // clamping keeps tooltips and drag from extrapolating past the chart edges.
      const [rMin, rMax] = _range;
      const clampP = Math.max(rMin, Math.min(rMax, p));
      if (hasLeft && clampP <= currentR1) return leftScale.invert(clampP);
      if (hasRight && clampP >= currentR2) return rightScale.invert(clampP);
      return midScale.invert(clampP);
    };

    scale.domain = function (d) {
      if (!arguments.length) return _domain.slice();
      _domain = [+d[0], +d[1]];
      rebuild();
      return scale;
    };

    scale.range = function (r) {
      if (!arguments.length) return _range.slice();
      _range = [+r[0], +r[1]];
      rebuild();
      return scale;
    };

    scale.data = function (d) {
      if (!arguments.length) return _data.slice();
      _data = d.filter(Number.isFinite);
      if (_data.length > 0) {
        _domain = [d3.min(_data), d3.max(_data)];
      }
      rebuild();
      return scale;
    };

    scale.window = function (w) {
      if (!arguments.length) return _window;
      _window = +w;
      rebuild();
      return scale;
    };

    scale.linearDomain = function (ld) {
      if (!arguments.length) return [currentXLo, currentXHi];
      _focusUncapped = false; // capped path — pan/drag and the auto window live here
      if (ld == null) {
        _xLoOverride = null;
        _xHiOverride = null;
      } else {
        _xLoOverride = +ld[0];
        _xHiOverride = +ld[1];
      }
      rebuild();
      return scale;
    };

    // Like linearDomain(), but flags the window as uncapped so rebuild() places it exactly on [lo,hi]
    // even past the windowCap bound. Used only by the "travel onto a log section" gesture — clicking
    // or arrow-keying a tail focuses its data, turning the previously-focused data into a log tail.
    scale.focusDomain = function (fd) {
      if (!arguments.length) return [currentXLo, currentXHi];
      if (fd == null) {
        _xLoOverride = null;
        _xHiOverride = null;
        _focusUncapped = false;
      } else {
        _xLoOverride = +fd[0];
        _xHiOverride = +fd[1];
        _focusUncapped = true;
      }
      rebuild();
      return scale;
    };

    scale.linearRange = function (lr) {
      if (!arguments.length) return [currentR1, currentR2];
      if (lr == null) {
        _r1Override = null;
        _r2Override = null;
      } else {
        _r1Override = +lr[0];
        _r2Override = +lr[1];
      }
      rebuild();
      return scale;
    };

    scale.clamp = function (c) {
      if (!arguments.length) return _clamp;
      _clamp = !!c;
      return scale;
    };

    // d3 convention: the value returned for null/undefined/NaN input (default undefined).
    scale.unknown = function (u) {
      if (!arguments.length) return _unknown;
      _unknown = u;
      return scale;
    };

    // Extend the outer domain to round values, like every d3 continuous scale. Only the extremes
    // move: the region boundaries (linear window, breakpoints) derive from the data and stay put;
    // the symlog tails simply run out to the rounded extremes. No-op degenerate domains pass through.
    scale.nice = function (count = 10) {
      const [d0, d1] = _domain;
      if (!(d1 > d0)) return scale;
      _domain = d3.scaleLinear().domain(_domain).nice(count).domain();
      rebuild();
      return scale;
    };

    scale.breakpointMethod = function (m) {
      if (!arguments.length) return _method;
      _method = m;
      rebuild();
      return scale;
    };

    // Magnitude-based so a "nice" negative candidate (-10, -50, -200) ranks the same as its
    // positive mirror — matches the sign-symmetric tick pool built in rebuild().
    const tickPriority = v => {
      if (v === 0) return 0;
      const av = Math.abs(v);
      const e = Math.floor(Math.log10(av) + 1e-9);
      const m = av / 10 ** e;
      const r = Math.abs(m - 1) < 1e-6 ? 4 : Math.abs(m - 5) < 1e-6 ? 3
              : Math.abs(m - 2) < 1e-6 ? 2 : Math.abs(m - Math.round(m)) < 1e-6 ? 1 : 0;
      return r * 1000 + e;
    };

    scale.ticks = function (count = 6) {
      const [rMin, rMax] = _range;
      const MIN_TICK_PX = (rMax - rMin) / count;
      const [xMin, xMax] = _domain;
      const cands = new Set(tickPool);
      midScale.ticks(10).forEach(v => cands.add(v));
      cands.add(xMin);
      cands.add(xMax);
      const placed = [...cands]
        .map(v => ({ v, px: scale(v), pr: tickPriority(v) }))
        .filter(c => c.px >= rMin - 1 && c.px <= rMax + 1)
        .sort((a, b) => b.pr - a.pr);
      const kept = [];
      for (const c of placed) if (kept.every(k => Math.abs(k.px - c.px) >= MIN_TICK_PX)) kept.push(c);
      return kept.sort((a, b) => a.px - b.px).map(c => c.v);
    };

    scale.tickFormat = function (count, specifier) {
      return midScale.tickFormat(count, specifier);
    };

    scale.copy = function () {
      // data() first — it derives _domain from the data's own extent. domain() then re-applies
      // afterward so an explicit custom domain (set after data on the original) survives the copy.
      const clone = scaleAdaptive()
        .data(_data.slice())
        .domain(_domain.slice())
        .range(_range.slice())
        .clamp(_clamp)
        .unknown(_unknown)
        .window(_window)
        .breakpointMethod(_method);
      if (_xLoOverride != null) {
        if (_focusUncapped) clone.focusDomain([_xLoOverride, _xHiOverride]);
        else clone.linearDomain([_xLoOverride, _xHiOverride]);
      }
      if (_r1Override != null) clone.linearRange([_r1Override, _r2Override]);
      return clone;
    };

    scale.regions = function () {
      const [xMin, xMax] = _domain;
      const [rMin, rMax] = _range;
      const list = [];
      if (hasLeft) {
        list.push({ type: 'log', domain: [xMin, currentXLo], range: [rMin, currentR1], pixels: currentR1 - rMin });
      }
      list.push({ type: 'linear', domain: [currentXLo, currentXHi], range: [currentR1, currentR2], pixels: currentR2 - currentR1 });
      if (hasRight) {
        list.push({ type: 'log', domain: [currentXHi, xMax], range: [currentR2, rMax], pixels: rMax - currentR2 });
      }
      return list;
    };

    scale.subscales = function() {
      return { leftScale, midScale, rightScale };
    };

    // [floor, ceil] the linear window is allowed to occupy — interaction code clamps to this so
    // panning/dragging can't push the window past the cap (where it would otherwise collapse).
    scale.windowBounds = windowCap;

    scale.type = 'adaptive';

    // d3 v6+ convention: scaleAdaptive(range) or scaleAdaptive(domain, range), both optional.
    if (range == null) { range = domain; domain = null; }
    if (domain != null) _domain = [+domain[0], +domain[1]];
    if (range != null) _range = [+range[0], +range[1]];

    rebuild();
    return scale;
  }
  return scaleAdaptive;
}
```

---

## Cell 10 (js)

```js
/**
 * Detect the boundary between the dense cluster and the outlier tails.
 * Returns { left, right } — values that define the three regions.
 * If left === domain min, there is no left tail (region collapses to zero width).
 * If right === domain max, there is no right tail.
 */
function detectBreakpoints(data, method = 'iqr') {
  if (!data || data.length < 2) {
    return { left: d3.min(data) ?? 0, right: d3.max(data) ?? 1 };
  }

  const sorted = [...data].filter(Number.isFinite).sort((a, b) => a - b);
  const dMin = sorted[0];
  const dMax = sorted[sorted.length - 1];

  if (dMin === dMax) return { left: dMin, right: dMax };

  if (method === 'iqr') {
    const q1 = d3.quantile(sorted, 0.25);
    const q3 = d3.quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const left  = Math.max(q1 - 1.5 * iqr, dMin);
    const right = Math.min(q3 + 1.5 * iqr, dMax);
    return { left, right };
  }

  // Log-space IQR: compute Tukey fences on log(value), then exponentiate back.
  // Correct for price/financial/count data spanning multiple orders of magnitude —
  // raw IQR fences go negative before reaching genuine low outliers.
  if (method === 'log-iqr') {
    const positive = sorted.filter((v) => v > 0);
    if (positive.length < 2) return { left: dMin, right: dMax };
    const logSorted = positive.map((v) => Math.log(v));
    const logQ1  = d3.quantile(logSorted, 0.25);
    const logQ3  = d3.quantile(logSorted, 0.75);
    const logIQR = logQ3 - logQ1;
    const left  = Math.max(Math.exp(logQ1 - 1.5 * logIQR), dMin);
    const right = Math.min(Math.exp(logQ3 + 1.5 * logIQR), dMax);
    return { left, right };
  }

  if (method === 'percentile') {
    const left  = d3.quantile(sorted, 0.10);
    const right = d3.quantile(sorted, 0.90);
    return { left, right };
  }

  throw new Error(`Unknown breakpoint method: ${method}`);
}
```

---

## Cell 11 (js)

```js
/**
 * Quantile-based strategy for finding the "linear window" boundaries (xLo, xHi).
 *
 * The slider value (0–1) is a universal "tightness" parameter:
 *   0 = narrowest window (median), 1 = widest window (full data scope).
 *
 * @param {number[]} values
 * @param {number} slider
 * @returns {{xLo: number, xHi: number}}
 */
function windowQuantile(values, slider) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    xLo: d3.quantileSorted(sorted, Math.max(0, 0.5 - slider / 2)),
    xHi: d3.quantileSorted(sorted, Math.min(1, 0.5 + slider / 2)),
  };
}
```

---

## Cell 12 (md)

```md
## The chart

`createAdaptiveChart` returns a detached SVG node. It renders the scatterplot, the draggable window (handles, pan, keyboard, travel-onto-a-tail), and the **tail rulers** — each log tail is tiled into chunks that each span the *same dollar width as the linear window*, so the shrinking chunk widths make the compression legible without reading a single number. Colours are CSS custom properties with dark fallbacks (see `CHART_CSS`), so you can theme it from the page.
```

---

## Cell 13 (js)

```js
createAdaptiveChart = {
  function createAdaptiveChart(points, {
    x = d => d.x,         // accessor for the adaptively-scaled (skewed) variable
    width = 900, height = 260,
    windowFraction = 0.5, // slider tightness [0,1]; named to avoid shadowing globalThis.window
    breakpointMethod = 'quantile', // 'quantile' | 'iqr' | 'log-iqr' | 'percentile' — see scaleAdaptive
    xFormat = '~s',
    mode,
    xLo: xLoOverride,    // explicit boundary from drag handles; undefined = use windowQuantile
    xHi: xHiOverride,
    qLo: qLoOverride,    // explicit pixel fraction [0,1] for r1; undefined = use slider
    qHi: qHiOverride,    // explicit pixel fraction [0,1] for r2; undefined = use slider
    focusXLo,            // uncapped focus window from the travel gesture (undefined = none)
    focusXHi,
    onWindowDrag,        // callback({ xLo, xHi }) fired on every drag move (lightweight)
    onWindowChange,      // callback({ xLo, xHi, qLo?, qHi? }) fired on dragend (triggers re-render)
    onTravel,            // callback({ xLo, xHi }) fired when a click/arrow travel completes
    ...options
  } = {}) {
    if (!points?.length) {
      // A sized, classed placeholder — an unsized bare <svg> renders as an invisible
      // 300×150 default box in an Observable cell bound to an empty data input.
      const empty = d3.select(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
        .attr('class', 'chart')
        .attr('viewBox', [0, 0, width, height])
        .style('width', '100%')
        .style('height', '100%');
      empty.append('text')
        .attr('x', width / 2).attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'currentColor').attr('fill-opacity', 0.4)
        .attr('font-size', '11px')
        .text('no data');
      return empty.node();
    }

    const resolvedMode = mode ?? detectScaleType(points.map(x));

    return resolvedMode === 'log'
      ? renderLog(points, { x, width, height, xFormat, ...options })
      : renderPiecewise(points, {
          x, width, height, windowFraction, breakpointMethod, xFormat,
          xLoOverride, xHiOverride, qLoOverride, qHiOverride, focusXLo, focusXHi,
          onWindowDrag, onWindowChange, onTravel,
          ...options,
        });
  }

  // ── Log mode ──────────────────────────────────────────────────────────────────

  function renderLog(points, { x, width, height, xFormat, ...options }) {
    const marginLeft = options.marginLeft ?? MARGIN.left;
    const marginRight = options.marginRight ?? MARGIN.right;
    const [xMin, xMax] = d3.extent(points, x);
    const innerW = width - marginLeft - marginRight;
    const xScale = d3.scaleLog().domain([xMin, xMax]).range([0, innerW]).nice();
    return createChart(points, xScale, { x, width, height, xFormat, ...options });
  }

  // ── Piecewise mode ────────────────────────────────────────────────────────────

  // Unique per-instance prefix for hatch clipPath ids — Observable renders many cells at
  // once; a shared id would silently clip the wrong chart.
  let _hatchInstId = 0;

  function renderPiecewise(points, {
    x, width, height, windowFraction, breakpointMethod, xFormat,
    xLoOverride, xHiOverride, qLoOverride, qHiOverride, focusXLo, focusXHi,
    onWindowDrag, onWindowChange, onTravel,
    minWindowPx = 20,     // minimum pixel width the linear region can be dragged down to
    showHint = true,      // the fading "click a section · ←/→ to travel" badge on first render
    tailTexture = 'ruler', // 'ruler' (chunk posts + per-chunk arrows) | 'hatch' (the diagonal-hatch
                           // density encoding from the development process — kept as an option so
                           // the article can embed the historical experiment on the current engine)
    tailTintBase = 0.02,  // fill opacity of the first (innermost) tail chunk
    tailTintStep = 0.012, // opacity added per chunk outward
    tailTintMax = 0.10,   // tint ceiling
    rulerMinPx = 2,       // tail chunk narrower than this stops the ruler (density cap)
    hatchSpacing = 8,     // hatch mode: px between the uniformly spaced diagonal lines
    hatchOpacity = 0.45,  // hatch mode: stroke opacity of the diagonal lines
    hatchAngle = 1,       // hatch mode: 1 = "\" diagonals, -1 = "/" diagonals
    ...options
  }) {
    const marginLeft = options.marginLeft ?? MARGIN.left;
    const marginRight = options.marginRight ?? MARGIN.right;
    const marginTop = options.marginTop ?? MARGIN.top;
    const marginBottom = options.marginBottom ?? MARGIN.bottom;
    const innerW = width  - marginLeft - marginRight;
    const innerH = height - marginTop  - marginBottom;
    const [xMin, xMax] = d3.extent(points, x);
    const xValues = points.map(x);
    const eps = (xMax - xMin) * 1e-9;

    const xScale = scaleAdaptive()
      .domain([xMin, xMax])
      .range([0, innerW])
      .data(xValues)
      .window(windowFraction)
      .breakpointMethod(breakpointMethod);

    if (xLoOverride != null && xHiOverride != null) {
      xScale.linearDomain([xLoOverride, xHiOverride]);
    }
    if (qLoOverride != null && qHiOverride != null) {
      xScale.linearRange([innerW * qLoOverride, innerW * qHiOverride]);
    }
    // An active travel ("focus") window is placed uncapped — exactly on a section's data.
    if (focusXLo != null && focusXHi != null) {
      xScale.focusDomain([focusXLo, focusXHi]);
    }

    const [xLo, xHi] = xScale.linearDomain();
    const [r1, r2] = xScale.linearRange();
    const r0 = 0;
    const r3 = innerW;

    let { leftScale, midScale, rightScale } = xScale.subscales();

    // Mutable window state the scale reads, so a drag can update the scale (and the axis)
    // in place. leftScale/midScale/rightScale are reassigned on drag too (see applyState).
    let currentXLo = xLo, currentXHi = xHi, currentR1 = r1, currentR2 = r2;
    // When true, interaction places the window uncapped via focusDomain (the travel gesture);
    // when false, the capped linearDomain path (pan/drag/auto). True if we loaded into a focus.
    let useFocus = (focusXLo != null && focusXHi != null);


    // Held for redrawing the x-axis live on drag. Colour comes from CHART_CSS (.tick/.domain).
    const xFmt = makeFmt(xFormat);

    const node = createChart(points, xScale, { x, width, height, xFormat, ...options });
    const g = d3.select(node).select('g');

    // Overlay on linear region — lowered below dots so dots still get pointer
    // events for tooltips. Drag is attached here so clicks on empty space in the
    // linear region trigger the pan while clicks on dots reach the dot handlers.
    const overlay = g.append('rect')
        .attr('class', 'pan-overlay')
        .attr('x', r1).attr('width', Math.max(0, r2 - r1))
        .attr('y', 0).attr('height', innerH)
        .attr('fill', 'transparent')
        .attr('pointer-events', 'all')
        .attr('tabindex', '0')
        .attr('role', 'slider')
        .attr('aria-label', 'Chart viewport — ←/→ travel between sections, Shift+←/→ to pan, double-click to reset')
        .style('outline', 'none')
      .lower();

    // Pan hint — a single badge that rides along centred in the linear window. It announces the
    // gesture on render, then fades after a few seconds. The ←/→ convey that the window slides
    // through the data; "scan the data" implies the whole range is reachable (push to an edge and
    // the window docks and keeps scrolling). It follows the window via positionPanHint() in
    // applyState, so it never gets left behind when you drag.
    const HINT_TEXT = 'click a section · ←/→ to travel · double-click resets';
    const hintFontSize = 10, hintPadY = 4, hintPadX = 9;
    const hintH = hintFontSize + hintPadY * 2;
    const hintW = HINT_TEXT.length * 5.5 + hintPadX * 2;
    const hintCy = innerH - hintH / 2 - 4;

    const panHintG = showHint
      ? g.append('g').attr('pointer-events', 'none').style('opacity', 0.9)
      : d3.select(null);
    if (showHint) {
      panHintG.append('rect')
        .attr('class', 'pan-hint-bg')
        .attr('x', -hintW / 2).attr('y', -hintH / 2)
        .attr('width', hintW).attr('height', hintH).attr('rx', hintH / 2)
        .attr('fill-opacity', 0.12)
        .attr('stroke-opacity', 0.3).attr('stroke-width', 1);
      panHintG.append('text')
        .attr('class', 'pan-hint-text')
        .attr('y', hintFontSize * 0.35)
        .attr('text-anchor', 'middle')
        .attr('fill-opacity', 0.65)
        .attr('font-size', `${hintFontSize}px`)
        .text(HINT_TEXT);
    }

    // Re-centre the badge in the current window; a no-op once faded/removed or with showHint off
    // (d3.select(null) is an empty selection, so the attr call touches nothing).
    const positionPanHint = () =>
      panHintG.attr('transform', `translate(${(currentR1 + currentR2) / 2},${hintCy})`);
    positionPanHint();

    if (showHint) {
      panHintG.style('transition', 'opacity 0.8s');
      setTimeout(() => {
        panHintG.style('opacity', 0);
        setTimeout(() => panHintG.remove(), 800);
      }, 3000);
    }

    // ── Region annotations ────────────────────────────────────────────────────
    // Permanent dimension-line annotations: one per scale region, always visible.
    // Shows the type label ("power" / "linear") above and the data range below.
    const ANNOT_Y   = 24;   // y of the dimension line
    const ANNOT_ARR = 5;    // arrowhead length in px

    function makeAnnotation(typeLabel) {
      const grp = g.append('g').attr('pointer-events', 'none');

      grp.append('text')
        .attr('class', 'annot-type').attr('y', 8).attr('text-anchor', 'middle')
        .attr('fill-opacity', 0.3)
        .attr('font-size', '9px').attr('font-style', 'italic')
        .text(typeLabel);

      // .annot-value carries its text-halo (paint-order + stroke = --chart-surface) from CHART_CSS.
      const valueTxt = grp.append('text')
        .attr('class', 'annot-value').attr('y', ANNOT_Y - 2).attr('text-anchor', 'middle')
        .attr('fill-opacity', 0.65)
        .attr('font-size', '10px').attr('font-weight', '500');

      const dimLine = grp.append('line')
        .attr('class', 'annot-line')
        .attr('y1', ANNOT_Y).attr('y2', ANNOT_Y)
        .attr('stroke-opacity', 0.45).attr('stroke-width', 1);
      const arrL = grp.append('polygon').attr('class', 'annot-arrow').attr('fill-opacity', 0.45);
      const arrR = grp.append('polygon').attr('class', 'annot-arrow').attr('fill-opacity', 0.45);

      return function update(p1, p2, lo, hi) {
        if (p2 - p1 < 2 * ANNOT_ARR + 28) { grp.style('display', 'none'); return; }
        grp.style('display', null);
        const cx = (p1 + p2) / 2;
        grp.select('.annot-type').attr('x', cx);
        valueTxt.attr('x', cx).text(xFmt(hi - lo));
        dimLine.attr('x1', p1 + ANNOT_ARR).attr('x2', p2 - ANNOT_ARR);
        arrL.attr('points', `${p1},${ANNOT_Y} ${p1+ANNOT_ARR},${ANNOT_Y-3} ${p1+ANNOT_ARR},${ANNOT_Y+3}`);
        arrR.attr('points', `${p2},${ANNOT_Y} ${p2-ANNOT_ARR},${ANNOT_Y-3} ${p2-ANNOT_ARR},${ANNOT_Y+3}`);
      };
    }

    const updateLinearAnnot = makeAnnotation('linear');

    // Tint ramp for the tail chunks — exposed as tailTintBase/Step/Max options.
    const TINT_BASE = tailTintBase;
    const TINT_STEP = tailTintStep;
    const TINT_MAX  = tailTintMax;

    // Tail rulers replace the hatch. The linear window's dollar width W is tiled across
    // each log tail: every chunk spans the SAME W dollars, so the symlog renders them at
    // shrinking widths toward the extreme. Each chunk boundary gets a full-height post —
    // the same vertical line the linear section has at its edge — and a chunk wide enough
    // also gets a ←→ dimension arrow up top. As compression grows the arrows drop out but
    // the posts remain and bunch. Because the symlog compresses monotonically, once a chunk
    // is narrower than RULER_MIN_PX every later one is too, so we stop there — capping the
    // posts at ~(tail width / RULER_MIN_PX), never thousands. Redrawn on every change.
    const leftRulerG  = g.append('g').attr('pointer-events', 'none');
    const rightRulerG = g.append('g').attr('pointer-events', 'none');

    // Raise dots above all decoration groups (axes, rulers, annotations) so they
    // paint on top and receive pointer events without the ruler rects dimming them.
    g.selectAll('circle').raise();

    const RULER_HEAD   = 2.4;                // ~20% smaller heads → a couple more arrows fit
    const ARROW_MIN_PX = 2 * RULER_HEAD + 9; // ~14px: room for a ←→ arrow
    const TEXT_MIN_PX  = 20;                 // room for a stacked "log" / "×1" label
    const RULER_MIN_PX = rulerMinPx;         // chunk narrower than this → stop (density cap); option
    function drawTailRuler(grp, sub, boundary, extreme, W) {
      if (!(W > 0) || boundary === extreme) {
        grp.selectAll('*').remove();
        return;
      }
      const outward = Math.sign(extreme - boundary) || 1;
      const hy = 3;

      const rects = [];
      const posts = [];
      const arrows = [];
      const texts = [];

      let collapseAt = null, lastDrawnK = -1;
      for (let k = 0; k < 4000; k++) {
        const d0 = boundary + outward * k * W;
        let d1 = boundary + outward * (k + 1) * W;
        const beyond = outward > 0 ? d1 >= extreme : d1 <= extreme;
        if (beyond) d1 = extreme;
        const a = Math.min(sub(d0), sub(d1)), b = Math.max(sub(d0), sub(d1));
        const w = b - a;
        if (w < RULER_MIN_PX) break;

        const bgOpacity = Math.min(TINT_BASE + k * TINT_STEP, TINT_MAX);
        rects.push({ id: `bg-${k}`, x: a, w: w, opacity: bgOpacity });

        const postX = outward > 0 ? b : a;
        posts.push({ id: `post-${k}`, x: postX, opacity: 0.14 });

        if (w >= ARROW_MIN_PX) {
          arrows.push({ id: `arrow-${k}`, x1: a, x2: b, opacity: 0.45 });
          if (w >= TEXT_MIN_PX) {
            // A tail narrower than one window-width can't be "×N window-widths" — show its
            // dollar span instead of a misleading ×0.x.
            const mult = beyond ? Math.abs(extreme - d0) / W : 1;
            const val = mult >= 1 ? `×${fmtMult(mult)}` : xFmt(Math.abs(extreme - d0));
            texts.push({ id: `lbl-t-${k}`, x: (a + b) / 2, y: 8, text: 'log', opacity: 0.3, italic: true, size: 9 });
            texts.push({ id: `lbl-v-${k}`, x: (a + b) / 2, y: ANNOT_Y - 2, text: val, opacity: 0.65, size: 10, weight: '500' });
          }
        } else if (collapseAt === null) {
          collapseAt = d0;
        }
        lastDrawnK = k;
        if (beyond) break;
      }

      if (collapseAt !== null) {
        const a = Math.min(sub(collapseAt), sub(extreme)), b = Math.max(sub(collapseAt), sub(extreme));
        const n = Math.abs(extreme - collapseAt) / W;
        if (n >= 1 && b - a > 1) {
          const subEdge = boundary + outward * (lastDrawnK + 1) * W;
          const sa = Math.min(sub(subEdge), sub(extreme)), sb = Math.max(sub(subEdge), sub(extreme));
          if (sb > sa) {
            const bgOpacity = Math.min(TINT_BASE + Math.max(0, lastDrawnK) * TINT_STEP, TINT_MAX);
            rects.push({ id: 'collapse-bg', x: sa, w: sb - sa, opacity: bgOpacity });

            const denseStart = outward > 0 ? sa + RULER_MIN_PX : sa;
            const denseEnd   = outward > 0 ? sb : sb - RULER_MIN_PX;
            for (let px = denseStart; px <= denseEnd; px += RULER_MIN_PX) {
              posts.push({ id: `dense-post-${px}`, x: px, opacity: 0.14 });
            }
          }
          arrows.push({ id: 'collapse-arrow', x1: a, x2: b, opacity: 0.65 });
          texts.push({ id: 'collapse-lbl-t', x: (a + b) / 2, y: 8, text: 'log', opacity: 0.3, italic: true, size: 9 });
          texts.push({ id: 'collapse-lbl-v', x: (a + b) / 2, y: ANNOT_Y - 2, text: n >= 1 ? `×${fmtMult(n)}` : xFmt(Math.abs(extreme - collapseAt)), opacity: 0.65, size: 10, weight: '500' });
        }
      }

      // Close the tail with a post at the extreme edge — the same vertical line the chart's start
      // edge gets. The chunk/dense loops step by RULER_MIN_PX and, under compression, stop a pixel
      // or two short of the extreme on the outward (right) tail, so pin the boundary explicitly to
      // keep both ends of the chart symmetric.
      posts.push({ id: 'edge', x: sub(extreme), opacity: 0.14 });

      // 1. Background Rectangles
      grp.selectAll('rect.ruler-bg')
        .data(rects, d => d.id)
        .join('rect')
          .attr('class', 'ruler-bg')
          .attr('x', d => d.x)
          .attr('width', d => d.w)
          .attr('y', 0)
          .attr('height', innerH)
          .attr('fill-opacity', d => d.opacity)
          .attr('pointer-events', 'none');

      // 2. Vertical Posts
      grp.selectAll('line.ruler-post')
        .data(posts, d => d.id)
        .join('line')
          .attr('class', 'ruler-post')
          .attr('x1', d => d.x)
          .attr('x2', d => d.x)
          .attr('y1', 0)
          .attr('y2', innerH)
          .attr('stroke-opacity', d => d.opacity)
          .attr('stroke-width', 1);

      // 3. Arrow Lines and Heads
      const arrowLines = grp.selectAll('g.ruler-arrow')
        .data(arrows, d => d.id)
        .join(
          enter => {
            const g = enter.append('g').attr('class', 'ruler-arrow');
            g.append('line');
            g.append('polygon').attr('class', 'arr-head-l');
            g.append('polygon').attr('class', 'arr-head-r');
            return g;
          }
        )
        .style('opacity', d => d.opacity);

      arrowLines.select('line')
        .attr('x1', d => d.x1 + RULER_HEAD)
        .attr('x2', d => d.x2 - RULER_HEAD)
        .attr('y1', ANNOT_Y)
        .attr('y2', ANNOT_Y)
        .attr('stroke-width', 1);

      arrowLines.select('.arr-head-l')
        .attr('points', d => `${d.x1},${ANNOT_Y} ${d.x1 + RULER_HEAD},${ANNOT_Y - hy} ${d.x1 + RULER_HEAD},${ANNOT_Y + hy}`);

      arrowLines.select('.arr-head-r')
        .attr('points', d => `${d.x2},${ANNOT_Y} ${d.x2 - RULER_HEAD},${ANNOT_Y - hy} ${d.x2 - RULER_HEAD},${ANNOT_Y + hy}`);

      // 4. Texts
      grp.selectAll('text.ruler-lbl')
        .data(texts, d => d.id)
        .join('text')
          .attr('class', 'ruler-lbl')
          .attr('x', d => d.x)
          .attr('y', d => d.y)
          .attr('text-anchor', 'middle')
          .attr('fill-opacity', d => d.opacity)
          .attr('font-size', d => `${d.size}px`)
          .attr('font-style', d => d.italic ? 'italic' : null)
          .attr('font-weight', d => d.weight ?? null)
          .text(d => d.text);
    }

    // ── Hatch texture (the development-process visual, kept as an option) ─────
    // Uniformly spaced 45° diagonal <line> elements across each log tail — a flat section
    // hatch marking the compressed regions, with one dimension annotation spanning the whole
    // tail instead of the ruler's per-chunk arrows. Lines are explicit primitives inside a
    // whole-tail clipPath — never SVG <pattern>, which Chrome clips at tile boundaries even
    // with overflow:visible, leaving anti-aliased dots at every seam.
    const hatchInstId = `hatch-${++_hatchInstId}`;
    const svgDefs = d3.select(node).select('defs');

    function drawTailHatch(grp, sub, boundary, extreme, W) {
      grp.selectAll('*').remove();
      const side = extreme < boundary ? 'l' : 'r';
      svgDefs.selectAll(`[id^="${hatchInstId}-${side}"]`).remove();
      if (!(W > 0) || boundary === extreme) return;
      const outward = Math.sign(extreme - boundary) || 1;

      // Whole-tail dimension annotation: log + dollar span, same classes as the ruler labels.
      const tA = Math.min(sub(boundary), sub(extreme)), tB = Math.max(sub(boundary), sub(extreme));
      if (tB - tA >= 2 * ANNOT_ARR + 28) {
        const cx = (tA + tB) / 2;
        grp.append('text').attr('class', 'ruler-lbl')
          .attr('x', cx).attr('y', 8).attr('text-anchor', 'middle')
          .attr('fill-opacity', 0.3).attr('font-size', '9px').attr('font-style', 'italic')
          .text('log');
        grp.append('text').attr('class', 'annot-value')
          .attr('x', cx).attr('y', ANNOT_Y - 2).attr('text-anchor', 'middle')
          .attr('fill-opacity', 0.65).attr('font-size', '10px').attr('font-weight', '500')
          .text(xFmt(Math.abs(extreme - boundary)));
        grp.append('line').attr('class', 'annot-line')
          .attr('x1', tA + ANNOT_ARR).attr('x2', tB - ANNOT_ARR)
          .attr('y1', ANNOT_Y).attr('y2', ANNOT_Y)
          .attr('stroke-opacity', 0.45).attr('stroke-width', 1);
        grp.append('polygon').attr('class', 'annot-arrow').attr('fill-opacity', 0.45)
          .attr('points', `${tA},${ANNOT_Y} ${tA + ANNOT_ARR},${ANNOT_Y - 3} ${tA + ANNOT_ARR},${ANNOT_Y + 3}`);
        grp.append('polygon').attr('class', 'annot-arrow').attr('fill-opacity', 0.45)
          .attr('points', `${tB},${ANNOT_Y} ${tB - ANNOT_ARR},${ANNOT_Y - 3} ${tB - ANNOT_ARR},${ANNOT_Y + 3}`);
      }

      // DISCRETE log sections, stepped density. Each tail is tiled into window-width chunks —
      // the same sections the ruler labels ×1, ×1, ×51 — and each section is hatched at ONE
      // uniform spacing derived from that section's average compression vs the linear window,
      // log-mapped (compression spans orders of magnitude; linear mapping would go sub-pixel).
      // The section adjacent to the window is sparsest; each section outward steps denser, so
      // "further from linear = more compressed" reads as discrete steps rather than the smooth
      // gradient (which looked like an artifact) or a flat tint (which hid the differences).
      //
      // Two lessons from earlier iterations are baked in:
      //  - Each section's lattice is phase-anchored at its INNER seam (the window-side edge),
      //    so a line starts exactly at every section boundary — seams read as intentional
      //    section starts, not as arbitrarily offset broken lines.
      //  - Once the spacing floor is reached, ALL remaining sections merge into one (spacing
      //    is monotone in compression), instead of fragmenting the far tail into dozens of
      //    identical slivers with their own clips.
      // Anchors are the line's x at mid-height; each section's march overshoots its clip by
      // innerH/2 per side, which covers the section's corners for either hatchAngle.
      const FLOOR = 1.5; // px — densest allowed lattice

      for (let k = 0; k < 4000; k++) {
        const d0 = boundary + outward * k * W;
        let d1 = boundary + outward * (k + 1) * W;
        let last = outward > 0 ? d1 >= extreme : d1 <= extreme;
        if (last) d1 = extreme;
        let a = Math.min(sub(d0), sub(d1)), b = Math.max(sub(d0), sub(d1));

        // Ordinal density steps: each section outward is 0.75× the spacing of the one before.
        // The sections all span the same dollar width, so ordinal position IS the compression
        // ordering; a fixed ratio keeps every step VISIBLE (a compression-derived mapping
        // asymptotes — by the fifth section the differences dropped below perception while
        // never reaching the merge floor).
        const spacing = Math.max(FLOOR, hatchSpacing * Math.pow(0.75, k));

        // At the floor (or too narrow to lattice), every remaining section renders identically —
        // merge them into one clip running to the extreme.
        if (spacing <= FLOOR + 0.01 || b - a < 3) {
          last = true;
          a = Math.min(sub(d0), sub(extreme));
          b = Math.max(sub(d0), sub(extreme));
        }

        const clipId = `${hatchInstId}-${side}${k}`;
        svgDefs.append('clipPath').attr('id', clipId)
          .append('rect').attr('x', a).attr('width', Math.max(0, b - a)).attr('y', 0).attr('height', innerH);
        const sectionG = grp.append('g').attr('clip-path', `url(#${clipId})`);

        // Lattice anchored at the inner seam: anchors seamC + n·spacing covering the section
        // plus innerH/2 overshoot each side.
        const seamC = outward > 0 ? a : b;
        const lo = a - innerH / 2, hi = b + innerH / 2;
        const startN = Math.ceil((lo - seamC) / spacing);
        for (let c = seamC + startN * spacing; c <= hi; c += spacing) {
          sectionG.append('line').attr('class', 'hatch-line')
            .attr('x1', c - hatchAngle * innerH / 2).attr('y1', 0)
            .attr('x2', c + hatchAngle * innerH / 2).attr('y2', innerH)
            .attr('stroke-opacity', hatchOpacity).attr('stroke-width', 1);
        }
        if (last) break;
      }
    }

    const drawTail = tailTexture === 'hatch' ? drawTailHatch : drawTailRuler;

    updateLinearAnnot(r1, r2, xLo, xHi);
    drawTail(leftRulerG,  leftScale,  xLo, xMin, xHi - xLo);
    drawTail(rightRulerG, rightScale, xHi, xMax, xHi - xLo);

    // Report the window the scale actually settled on (after capping) so the page readout
    // reflects what's rendered, not the raw slider quantiles.
    onWindowDrag?.({ xLo, xHi });

    // ── Drag handles ─────────────────────────────────────────────────────────────
    if (onWindowChange) {
      const circles = g.selectAll('circle');

      function applyState(newXLo, newXHi, newR1, newR2) {
        if (useFocus) xScale.focusDomain([newXLo, newXHi]);
        else          xScale.linearDomain([newXLo, newXHi]);
        xScale.linearRange([newR1, newR2]);
        const sub = xScale.subscales();
        leftScale = sub.leftScale;
        midScale = sub.midScale;
        rightScale = sub.rightScale;
        // Read the window BACK from the scale: it may have capped the domain (never swallow the
        // outliers) or reserved tail pixels. The chart renders whatever the scale decided.
        [currentXLo, currentXHi] = xScale.linearDomain();
        [currentR1,  currentR2 ] = xScale.linearRange();
        circles.attr('cx', d => xScale(d.x));
        overlay.attr('x', currentR1).attr('width', Math.max(0, currentR2 - currentR1));
        leftHandle?.attr('transform',  `translate(${currentR1},0)`);
        rightHandle?.attr('transform', `translate(${currentR2},0)`);
        positionPanHint();  // the hint badge rides along, centred in the window
        // Live x-axis redraw — colour is inherited from CHART_CSS, so just rebind the axis.
        g.select('.x-axis').call(d3.axisBottom(xScale).ticks(tickCountForWidth(innerW)).tickFormat(xFmt));
        updateLinearAnnot(currentR1, currentR2, currentXLo, currentXHi);
        drawTail(leftRulerG,  leftScale,  currentXLo, xMin, currentXHi - currentXLo);
        drawTail(rightRulerG, rightScale, currentXHi, xMax, currentXHi - currentXLo);
        rebuildTailOverlays();
        onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi });
      }

      // ── Travel overlays on the log tails ───────────────────────────────────────
      // Each tail is tiled into linear-window-wide chunks (the same chunks drawTailRuler draws). A
      // transparent rect per tail catches the pointer; hovering highlights the chunk under the cursor
      // and clicking travels the focus onto JUST that chunk's range. Sits above the rulers (the wash
      // shows) but below the dots (tooltips still fire). Click does NOT stopPropagation, so a
      // double-click still bubbles to the container's reset — a 250ms timer the dblclick cancels keeps
      // that double-click from also firing a travel.
      const tailG = g.append('g').attr('class', 'tail-overlays');
      // The highlight that tracks the hovered chunk (pointer-events off so the catcher still gets clicks).
      const chunkHL = tailG.append('rect').attr('class', 'tail-hover-chunk')
        .attr('y', 0).attr('height', innerH)
        .attr('fill', 'var(--ruler-tint)').attr('fill-opacity', 0)
        .attr('pointer-events', 'none');
      let travelClickTimer = null;
      function scheduleTravel(lo, hi) {
        if (travelClickTimer) clearTimeout(travelClickTimer);
        travelClickTimer = setTimeout(() => { travelClickTimer = null; travelTo(lo, hi); }, 250);
      }
      function cancelScheduledTravel() {
        if (travelClickTimer) { clearTimeout(travelClickTimer); travelClickTimer = null; }
      }

      // The window-width chunk [lo,hi] of a tail under pixel px — W = linear-window width in DOLLARS,
      // tiled outward from the linear edge (matching drawTailRuler's chunks). null if degenerate.
      function chunkAt(side, px) {
        const W = currentXHi - currentXLo;
        if (!(W > 0)) return null;
        const v = xScale.invert(px);
        if (side === 'right') {
          const k = Math.max(0, Math.floor((v - currentXHi) / W));
          return [currentXHi + k * W, Math.min(currentXHi + (k + 1) * W, xMax)];
        }
        const k = Math.max(0, Math.floor((currentXLo - v) / W));
        return [Math.max(currentXLo - (k + 1) * W, xMin), currentXLo - k * W];
      }

      // The next window-width chunk in `dir` (>0 right, <0 left) that actually contains data — skips
      // empty chunks so arrow-stepping lands on the next populated section instead of stalling on a gap.
      // Returns null when there's no more data that way (the end of the range).
      function nextChunkWithData(dir) {
        const W = currentXHi - currentXLo;
        if (!(W > 0)) return null;
        if (dir > 0) {
          let next = Infinity;
          for (const x of xValues) if (x > currentXHi + eps && x < next) next = x;
          if (!isFinite(next)) return null;
          const k = Math.max(0, Math.floor((next - currentXHi) / W));
          return [currentXHi + k * W, Math.min(currentXHi + (k + 1) * W, xMax)];
        }
        let prev = -Infinity;
        for (const x of xValues) if (x < currentXLo - eps && x > prev) prev = x;
        if (!isFinite(prev)) return null;
        const k = Math.max(0, Math.floor((currentXLo - prev) / W));
        return [Math.max(currentXLo - (k + 1) * W, xMin), currentXLo - k * W];
      }

      // True if any data point falls inside the chunk [lo, hi]. Empty chunks aren't travel targets
      // (travelTo no-ops them, nextChunkWithData skips them), so they get no hover feedback either.
      const chunkHasData = ([lo, hi]) => xValues.some((x) => x >= lo - eps && x <= hi + eps);

      // Position the hover highlight over a chunk and report whether it's a live target. A null or
      // empty chunk hides the highlight and returns false (so the caller drops the pointer cursor too).
      function showChunkHL(chunk) {
        if (!chunk || !chunkHasData(chunk)) { chunkHL.attr('fill-opacity', 0); return false; }
        const a = xScale(chunk[0]), b = xScale(chunk[1]);
        chunkHL.attr('x', Math.min(a, b)).attr('width', Math.max(1, Math.abs(b - a))).attr('fill-opacity', 0.08);
        return true;
      }
      const hideChunkHL = () => chunkHL.attr('fill-opacity', 0);

      function rebuildTailOverlays() {
        const tails = [];
        if (currentXLo > xMin + eps) tails.push({ side: 'left',  x0: r0,        x1: currentR1 });
        if (currentXHi < xMax - eps) tails.push({ side: 'right', x0: currentR2, x1: r3 });
        tailG.selectAll('rect.tail-overlay')
          .data(tails, d => d.side)
          .join(
            // Transparent pointer-catcher per tail; the visible feedback is chunkHL, positioned on move.
            enter => enter.append('rect')
              .attr('class', d => `tail-overlay tail-${d.side}`)
              .attr('y', 0).attr('height', innerH)
              .attr('fill', 'transparent')
              .attr('pointer-events', 'all')
              .style('cursor', 'pointer')
              .on('pointermove', (event, d) => {
                const chunk = chunkAt(d.side, d3.pointer(event, g.node())[0]);
                event.currentTarget.style.cursor = showChunkHL(chunk) ? 'pointer' : 'default';
              })
              .on('pointerleave', hideChunkHL)
              .on('click', (event, d) => { const c = chunkAt(d.side, d3.pointer(event, g.node())[0]); if (c) scheduleTravel(c[0], c[1]); })
              .on('dblclick', cancelScheduledTravel),
            update => update,
          )
          .attr('x', d => Math.min(d.x0, d.x1))
          .attr('width', d => Math.max(0, Math.abs(d.x1 - d.x0)));
        chunkHL.raise(); // keep the highlight above the (transparent) catchers
      }

      // Travel the focus onto [loBound, hiBound] exactly (a window-width chunk, or a keyboard step):
      // those points fill the linear section, the rest becomes log tails. No-op if the range is empty.
      function travelTo(loBound, hiBound) {
        if (!(hiBound > loBound)) return;
        if (!chunkHasData([loBound, hiBound])) return;
        hideChunkHL();
        // Clicking a tail-overlay rect (not focusable) blurs the pan-overlay, which owns the arrow
        // keys, so after a click-travel the keyboard went dead until you clicked back into the linear
        // section. Hand focus back to the overlay so click-travel stays keyboard-ready. A no-op for
        // arrow-travel, where the overlay already holds focus.
        overlay.node()?.focus({ preventScroll: true });
        // Destination geometry from a fresh focus scale — it picks the tail/focus pixel split.
        const aim = scaleAdaptive().domain([xMin, xMax]).range([0, innerW])
          .data(xValues).window(windowFraction).breakpointMethod(breakpointMethod)
          .focusDomain([loBound, hiBound]);
        const [aimXLo, aimXHi] = aim.linearDomain();
        const [aimR1,  aimR2 ] = aim.linearRange();
        useFocus = true;
        node.animateToWindow(aimXLo, aimXHi, aimR1, aimR2, { focus: true }, null,
          () => onTravel?.({ xLo: aimXLo, xHi: aimXHi }));
      }

      // The boundary in dollars is read straight off the scale's own invert at the handle's
      // pixel — pure math layer, smooth and monotonic. The window can't run away to a flattened
      // view because scaleAdaptive caps it to the non-outlier range; the chart just renders that.
      function applyLeftDrag(px) {
        const newXLo = Math.max(xMin + eps, xScale.invert(px));
        applyState(newXLo, currentXHi, px, currentR2);
        return newXLo;
      }

      function applyRightDrag(px) {
        const newXHi = Math.min(xMax - eps, xScale.invert(px));
        applyState(currentXLo, newXHi, currentR1, px);
        return newXHi;
      }

      function makeHandle(initialPx, side) {
        const label = side === 'left' ? 'Left boundary — arrow keys to move' : 'Right boundary — arrow keys to move';
        const handle = g.append('g')
          .attr('class', `handle handle-${side}`)
          .attr('transform', `translate(${initialPx},0)`)
          .style('cursor', 'col-resize')
          .style('outline', 'none')
          .attr('tabindex', '0')
          .attr('role', 'slider')
          .attr('aria-label', label);

        handle.append('line')
          .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', innerH)
          .attr('stroke', 'transparent').attr('stroke-width', 8)
          .style('pointer-events', 'stroke');

        handle.append('line')
          .attr('class', 'handle-line')
          .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', innerH)
          .attr('stroke-width', 1).attr('stroke-opacity', 0.3)
          .style('pointer-events', 'none');

        const pillW = 8, pillH = 20;
        const pillY  = innerH / 2 - pillH / 2;
        const pill = handle.append('rect')
          .attr('class', 'handle-pill')
          .attr('x', -pillW / 2).attr('y', pillY)
          .attr('width', pillW).attr('height', pillH)
          .attr('rx', pillW / 2)
          .attr('fill-opacity', 0.22)
          .style('pointer-events', 'none');

        [-2, 2].forEach(cx =>
          [-5, 0, 5].forEach(dy =>
            handle.append('circle')
              .attr('class', 'handle-grip')
              .attr('cx', cx).attr('cy', innerH / 2 + dy)
              .attr('r', 1)
              .attr('fill-opacity', 0.6)
              .style('pointer-events', 'none')
          )
        );

        handle.on('pointerenter focus', () => {
          pill.attr('fill-opacity', 0.55);
          handle.select('.handle-line').attr('stroke-opacity', 0.6);
        });
        handle.on('pointerleave blur', () => {
          pill.attr('fill-opacity', 0.22);
          handle.select('.handle-line').attr('stroke-opacity', 0.3);
        });

        return handle;
      }

      // Declare handles before pan drag so the pan closure can reference them.
      let leftHandle, rightHandle;
      // Set on the first move of any drag; a drag that never moves is a click (see end handlers).
      let dragMoved = false;
      // A window tween (travel or reset) is in flight — gates arrow-repeat travel so holding the key
      // steps one section per animation instead of re-targeting every key-repeat (which drifts).
      let animating = false;

      // Pan: the box translates rigidly in pixel space; the domain follows at a uniform
      // dollar-per-pixel rate. When the pointer pushes past a chart edge the box docks and
      // the window AUTO-SCROLLS through the data on a d3.timer, so it keeps going while the
      // pointer is held — speed scaling with how far past the edge the pointer is. The
      // accumulated scroll is folded into the domain so dragging back is seamless.
      const AUTO_GAIN = 0.12;          // overshoot px → fraction of a pan-step per ~frame
      const AUTO_MAX_OVERSHOOT = 120;  // cap so it can't scroll absurdly fast
      // The window must stay within the scale's cap (capped mode), or the full data extremes when
      // focused (uncapped travel) — otherwise panning past the bound collapses the window.
      const panBounds = () => useFocus ? [xMin, xMax] : xScale.windowBounds();
      let [panLo, panHi] = panBounds();
      let panStartX = 0, panStartR1 = r1, panStartXLo = xLo, panStartXHi = xHi;
      let panBoxW = r2 - r1, panRate = (xHi - xLo) / panBoxW;
      let panPointerX = 0, panAutoAccum = 0, panPrevElapsed = 0, panTimer = null;

      const panOvershoot = () => {              // signed px the desired box sits past an edge
        const desiredR1 = panStartR1 + (panPointerX - panStartX);
        if (desiredR1 > r3 - panBoxW) return Math.min(desiredR1 - (r3 - panBoxW), AUTO_MAX_OVERSHOOT);
        if (desiredR1 < r0)          return Math.max(desiredR1 - r0, -AUTO_MAX_OVERSHOOT);
        return 0;
      };
      function panApply() {
        const delta   = panPointerX - panStartX;
        const newR1   = Math.max(r0, Math.min(r3 - panBoxW, panStartR1 + delta)); // box docks at edge
        const newR2   = newR1 + panBoxW;
        const boundedDelta = newR1 - panStartR1;                                  // pointer pan, capped at the dock
        let newXLo = panStartXLo + boundedDelta * panRate + panAutoAccum;
        let newXHi = panStartXHi + boundedDelta * panRate + panAutoAccum;
        if (newXLo < panLo) { newXHi -= (newXLo - panLo); newXLo = panLo; }
        if (newXHi > panHi) { newXLo -= (newXHi - panHi); newXHi = panHi; }
        applyState(newXLo, newXHi, newR1, newR2);
      }

      overlay.call(d3.drag()
        .on('start', event => {
          dragMoved = false;
          [panLo, panHi] = panBounds();
          panStartX = event.x; panPointerX = event.x;
          panStartR1 = currentR1; panStartXLo = currentXLo; panStartXHi = currentXHi;
          panBoxW = currentR2 - currentR1; panRate = (currentXHi - currentXLo) / panBoxW;
          panAutoAccum = 0; panPrevElapsed = 0;
          overlay.style('cursor', 'grabbing');
          panTimer = d3.timer(elapsed => {
            const dt = Math.min(elapsed - panPrevElapsed, 50); panPrevElapsed = elapsed;
            const over = panOvershoot();
            // Only keep scrolling while there's data left to reveal in that direction.
            const canScroll = over > 0 ? currentXHi < panHi - eps * 2
                            : over < 0 ? currentXLo > panLo + eps * 2 : false;
            if (canScroll) { dragMoved = true; panAutoAccum += over * panRate * AUTO_GAIN * (dt / 16); panApply(); }
          });
        })
        .on('drag', event => { dragMoved = true; panPointerX = event.x; panApply(); })
        .on('end', () => {
          if (panTimer) { panTimer.stop(); panTimer = null; }
          overlay.style('cursor', null);
          // A pure click (no movement) must not re-render: it would replace the SVG between
          // the two clicks of a double-click and swallow the reset gesture.
          if (dragMoved) onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
        })
      );

      leftHandle  = makeHandle(r1, 'left');
      rightHandle = makeHandle(r2, 'right');

      // Dots sit above the handles so a point under a handle line still shows its tooltip on hover.
      // Points are tiny, so the full-height handle hit-line stays grabbable everywhere they aren't.
      g.select('g.dots').raise();

      rebuildTailOverlays(); // initial travel overlays on the present tails

      const kbStep = event => event.shiftKey ? innerW * 0.02 : 5;

      // A keyboard nudge updates the window in place (cheap — same path as a live mouse drag) and
      // defers the heavy commit (state write + chart rebuild that re-settles Spread) until presses
      // stop. Holding an arrow key then rebuilds once on release, not on every key repeat. This
      // mirrors the mouse drag/dragend split. stopPan cancels a pending commit on teardown.
      let kbCommit = null;
      const scheduleCommit = () => {
        if (kbCommit) clearTimeout(kbCommit);
        kbCommit = setTimeout(() => {
          kbCommit = null;
          onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
        }, 160);
      };

      leftHandle.on('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const dir = event.key === 'ArrowRight' ? 1 : -1;
        const px = Math.max(r0, Math.min(currentR2 - minWindowPx, currentR1 + dir * kbStep(event)));
        applyLeftDrag(px);
        leftHandle.attr('aria-valuenow', currentXLo);
        onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
        scheduleCommit();
      });

      rightHandle.on('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const dir = event.key === 'ArrowRight' ? 1 : -1;
        const px = Math.max(currentR1 + minWindowPx, Math.min(r3, currentR2 + dir * kbStep(event)));
        applyRightDrag(px);
        rightHandle.attr('aria-valuenow', currentXHi);
        onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
        scheduleCommit();
      });

      overlay.on('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const dir = event.key === 'ArrowRight' ? 1 : -1;

        // Plain arrow → step one window-width chunk into the adjacent tail (keyboard twin of clicking
        // the chunk nearest the linear window). Ignore auto-repeats while a tween runs, so holding the
        // key advances one section per animation rather than dragging the axis along.
        if (!event.shiftKey) {
          if (animating) return;
          const chunk = nextChunkWithData(dir); // skips empty chunks; null at the end of the data
          if (chunk) travelTo(chunk[0], chunk[1]);
          return;
        }

        // Shift+arrow → fine pan (the original keyboard behaviour). Same cap handling as the mouse
        // pan: clamp to the window bounds and shift as a unit so it parks at the bound with its
        // width intact, instead of drifting past it.
        [panLo, panHi] = panBounds();
        const boxW  = currentR2 - currentR1;
        const step  = kbStep(event);
        const panRate = (currentXHi - currentXLo) / boxW;
        const newR1 = Math.max(r0, Math.min(r3 - boxW, currentR1 + dir * step));
        const newR2 = newR1 + boxW;
        let newXLo = currentXLo + dir * step * panRate;
        let newXHi = currentXHi + dir * step * panRate;
        if (newXLo < panLo) { newXHi -= (newXLo - panLo); newXLo = panLo; }
        if (newXHi > panHi) { newXLo -= (newXHi - panHi); newXHi = panHi; }
        applyState(newXLo, newXHi, newR1, newR2);
        onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
        scheduleCommit();
      });

      leftHandle.call(d3.drag()
        .on('drag', event => {
          dragMoved = true;
          const px = Math.max(r0, Math.min(currentR2 - minWindowPx, event.x));
          applyLeftDrag(px);
          onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
        })
        .on('start', () => { dragMoved = false; })
        .on('end', () => {
          if (dragMoved) onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
        })
      );

      rightHandle.call(d3.drag()
        .on('drag', event => {
          dragMoved = true;
          const px = Math.max(currentR1 + minWindowPx, Math.min(r3, event.x));
          applyRightDrag(px);
          onWindowDrag?.({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
        })
        .on('start', () => { dragMoved = false; })
        .on('end', () => {
          if (dragMoved) onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
        })
      );
      node.stopPan = () => {
        if (panTimer) { panTimer.stop(); panTimer = null; }
        if (kbCommit) { clearTimeout(kbCommit); kbCommit = null; }
        cancelScheduledTravel();
      };

      // Window-travel animation. animateToWindow tweens from the current window to an explicit
      // destination; focus:true keeps applyState on the uncapped focusDomain path for the whole
      // tween (the click/arrow travel), focus:false lands on the capped path (reset). A new call
      // cancels any in-flight tween, so a reset interrupts a travel and rapid travels re-target.
      let resetTimer = null;
      node.animateToWindow = (aimXLo, aimXHi, aimR1, aimR2, { focus = false } = {}, onProgress, onDone) => {
        if (resetTimer) { resetTimer.stop(); resetTimer = null; }
        animating = true;
        const fromXLo = currentXLo, fromXHi = currentXHi, fromR1 = currentR1, fromR2 = currentR2;
        const DURATION = 650;
        resetTimer = d3.timer(elapsed => {
          const t = Math.min(1, elapsed / DURATION);
          const e = d3.easeCubicInOut(t);
          // Interpolate uncapped between two known-good endpoints so the cap can't snap an out-of-cap
          // start (a focused window). Settle into the real mode at the end: travel → stay focused
          // (uncapped); reset → capped (the auto destination is in-cap, so its placement is identical).
          useFocus = true;
          applyState(
            fromXLo + (aimXLo - fromXLo) * e,
            fromXHi + (aimXHi - fromXHi) * e,
            fromR1  + (aimR1  - fromR1)  * e,
            fromR2  + (aimR2  - fromR2)  * e,
          );
          onProgress?.(e);
          if (t >= 1) { resetTimer.stop(); resetTimer = null; animating = false; useFocus = focus; onDone?.(); }
        });
      };

      // Reset/double-click: tween back to the auto (capped) window at the target slider value.
      node.animateToAuto = (targetWindow, onProgress, onDone) => {
        const aim = scaleAdaptive()
          .domain([xMin, xMax]).range([0, innerW])
          .data(xValues).window(targetWindow).breakpointMethod(breakpointMethod);
        const [aimXLo, aimXHi] = aim.linearDomain();
        const [aimR1,  aimR2 ] = aim.linearRange();
        node.animateToWindow(aimXLo, aimXHi, aimR1, aimR2, { focus: false }, onProgress, () => {
          useFocus = false;
          onDone?.();
        });
      };
    }

    return node;
  }
  return createAdaptiveChart;
}
```

---

## Cell 14 (js)

```js
createChart = {
  let _clipId = 0;
// Incrementing counter for unique clip-path ids across chart instances.
  // Observable renders many cells simultaneously — a shared id silently breaks clipping.
  
  
  // Stylesheet injected into every chart SVG. The division of labour is strict: JS owns geometry
  // and data-driven opacity (dot density, ruler tint ramp); CSS owns every colour, via custom
  // properties. Fallbacks match the dark theme, so a chart pasted into an Observable cell renders
  // standalone — define the --tokens (see index.html) to theme it, e.g. by toggling data-theme.
  
  
  /**
   * Create a scatterplot SVG node.
   *
   * Returns svg.node() — caller is responsible for inserting it into the DOM.
   * This matches the Observable cell pattern: `chart = createChart(data, scale, {width})`.
   *
   * Data of any shape is accepted via the x/y/label/meta accessor options
   * (defaults assume {x, y, label, meta} objects).
   *
   * @param {Array}    data     one datum per dot, any shape the accessors understand
   * @param {Function} xScale   D3-compatible scale, already ranged to [0, innerWidth]
   * @param {Object}   options
   * @returns {SVGElement}
   */
    function createChart(data, xScale, {
    x            = d => d.x,     // horizontal value accessor (the adaptively-scaled variable)
    y            = d => d.y,     // vertical value accessor
    label        = d => d.label, // tooltip headline accessor (nullish → line omitted)
    meta         = d => d.meta,  // tooltip secondary-line accessor (nullish → line omitted)
    width        = 900,
    height       = 260,
    marginTop    = MARGIN.top,
    marginRight  = MARGIN.right,
    marginBottom = MARGIN.bottom,
    marginLeft   = MARGIN.left,
    xLabel       = 'x',
    yLabel       = 'y',
    xFormat      = '~s',
    yFormat      = '~s',
    yType        = d3.scaleLinear,  // d3 scale constructor for the y axis
    clipPadding,             // extra px around the plot area before clipping; defaults to dot radius
    rankNoun     = 'points', // plural noun for the tooltip's percentile line ("… of companies")
    dotRadius,               // undefined → auto-size by point count
    dotOpacity,              // undefined → auto-size by density
    spread       = false,    // y-only collision spread — keeps x (the scale axis) exact
    spreadSeed,              // previous render's spread offsets (by index) — see jNodes init below
    yTicks       = 5,        // number of y-axis ticks; reduce for discrete datasets (e.g. year)
  } = {}) {
    const points = data.map(d => ({ x: +x(d), y: +y(d), label: label(d), meta: meta(d) }));
    const innerW = width  - marginLeft - marginRight;
    const innerH = height - marginTop  - marginBottom;
    const clipId = `clip-${++_clipId}`;
    const r   = dotRadius  ?? (points.length > 500 ? 2 : 3);
    const pad = clipPadding ?? r;
  
    const autoOpacity = dotOpacity ?? (points.length > 500 ? 0.35 : points.length > 100 ? 0.55 : 0.8);
  
    const [yMin, yMax] = d3.extent(points, d => d.y);
    const yRange = yMax - yMin;
    const yPad = yRange * 0.05 || Math.abs(yMin) * 0.05 || 1;
    const yScale = yType()
      .domain([yMin - yPad, yMax + yPad]).nice()
      .range([innerH, 0]);
  
    const xFmt = makeFmt(xFormat);
    const yFmt = makeFmt(yFormat);
  
    const svg = d3.create('svg')
      .attr('class', 'chart')
      .attr('viewBox', [0, 0, width, height])
      .style('width', '100%')
      .style('height', '100%')
      .style('overflow', 'visible')
      .style('font', '10px sans-serif');
  
    svg.append('style').text(CHART_CSS);
  
    svg.append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', -pad).attr('y', -pad)
      .attr('width', innerW + 2 * pad)
      .attr('height', innerH + 2 * pad);
  
    const g = svg.append('g')
      .attr('transform', `translate(${marginLeft},${marginTop})`);
  
    // ── x-axis ───────────────────────────────────────────────────────────────
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(tickCountForWidth(innerW)).tickFormat(xFmt));
  
    // ── y-axis ───────────────────────────────────────────────────────────────
    g.append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(yScale).ticks(yTicks).tickFormat(yFmt));
  
    // ── SVG-internal tooltip ─────────────────────────────────────────────────
    const tt = g.append('g')
      .attr('class', 'tooltip')
      .attr('pointer-events', 'none')
      .style('display', 'none');
  
    tt.append('rect')
      .attr('class', 'tt-bg')
      .attr('rx', 4)
      .attr('stroke-width', 1);
  
    // Percentile rank of each point by x (the skewed variable) — answers "where does this sit in
    // the distribution", which is what the scale is all about. Sorted once; bisect per hover.
    const xSorted = points.map(d => d.x).sort((a, b) => a - b);
    const n = xSorted.length;
    const rankLine = x => {
      const pct = Math.round((d3.bisectLeft(xSorted, x) / Math.max(1, n)) * 100);
      return pct >= 50
        ? `bigger than ${Math.min(pct, 99)}% of ${rankNoun}`
        : `smaller than ${Math.min(100 - pct, 99)}% of ${rankNoun}`;
    };
    const truncate = (s, max) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);
    const TT_LINE_H = 16, TT_PAD_X = 8;
  
    // ── Dots ─────────────────────────────────────────────────────────────────
    const circles = g.append('g')
      .attr('class', 'dots')
      .attr('clip-path', `url(#${clipId})`)
      .selectAll('circle')
      .data(points)
      .join('circle')
        .attr('class', 'dot')
        .attr('cx', d => xScale(d.x))
        .attr('cy', d => yScale(d.y))
        .attr('r', r)
        .attr('fill-opacity', autoOpacity);
  
    // spread: true  → run simulation, start at spread positions
    // spread: false → run simulation, start at true positions (entrance animation:
    //                 caller will fire setSpread(true) after first paint)
    // spread: null  → skip simulation entirely; caller guarantees setSpread won't be called
    //
    // spreadSeed carries the PREVIOUS render's settled offsets (y − cy0, by index — same dataset,
    // same order). Starting each node at its old offset makes the collision solver refine the
    // existing arrangement instead of re-deriving one from scratch: from a cold all-at-cy0 start,
    // whether collide pushes a dot up or down hinges on sub-pixel overlap differences, so a small
    // scale change (handle drag) flips assignments arbitrarily and dots visibly swap sides on
    // every release. Seeded, they keep their side and just shift. Ignored on a dataset change
    // (the caller drops the seed when the point count differs).
    const seeded = Array.isArray(spreadSeed) && spreadSeed.length === points.length;
    const jNodes = points.map((d, i) => ({
      fx:  xScale(d.x),
      x:   xScale(d.x),
      y:   yScale(d.y) + (seeded ? spreadSeed[i] || 0 : 0), // sim start; equals cy0 when skipped
      cy0: yScale(d.y),   // true position (restoring target + toggle reference)
      density: 0,
    }));
  
    if (spread !== null) {
      // Count near-neighbours (O(n²), fast enough for ≤ 500 pts). A neighbour is any dot
      // whose true position is within 4 radii — close enough to compete for pixel space.
      const nbThresh2 = (4 * (r + 1)) ** 2;
      for (let i = 0; i < jNodes.length; i++) {
        for (let j = i + 1; j < jNodes.length; j++) {
          const dx = jNodes[j].x   - jNodes[i].x;
          const dy = jNodes[j].cy0 - jNodes[i].cy0;
          if (dx * dx + dy * dy < nbThresh2) {
            jNodes[i].density++;
            jNodes[j].density++;
          }
        }
      }
      const maxDensity = jNodes.reduce((m, n) => Math.max(m, n.density), 1);
  
      // Wall force: constant strength (not alpha-scaled) so the wall stays hard in
      // the final settled ticks and no dot can be pushed off-screen by collide.
      const wallLo = r + 1, wallHi = innerH - r - 1;
      function wallForce() {
        for (const node of jNodes) {
          if (node.y < wallLo) node.vy += (wallLo - node.y) * 0.4;
          if (node.y > wallHi) node.vy -= (node.y - wallHi) * 0.4;
        }
      }
  
      d3.forceSimulation(jNodes)
        .force('collide', d3.forceCollide(r + 1).strength(0.8))
        .force('y', d3.forceY(d => d.cy0).strength(
          // Isolated dots get a strong restoring force (barely move).
          // Dense dots get a weak one so they can spread far enough to be visible.
          d => Math.max(0.05, 0.35 - (d.density / maxDensity) * 0.30)
        ))
        .force('wall', wallForce)
        // Seeded runs start cool: at full alpha the restoring d3.forceY collapses the seeded
        // arrangement back into a pile within a few ticks and collide re-separates it from
        // scratch — chaotically, defeating the seed. Collide moves nodes directly (not
        // alpha-scaled), so a low-alpha pass still resolves the overlaps a scale change
        // introduced while preserving which side of the cluster each dot settled on.
        .alpha(seeded ? 0.12 : 1)
        .stop()
        .tick(200);
    }
  
    circles.attr('cy', (_, i) => spread === true ? jNodes[i].y : jNodes[i].cy0);
  
    circles.on('pointerenter', function(event, d) {
        d3.select(this).raise()
          .attr('r', r + 2)
          .attr('fill-opacity', 1);
  
        // Lead with the point's identity (name/title/place), then the two values, then its
        // rank in the distribution. label/meta come from the loader; absent → those lines drop.
        const lines = [];
        if (d.label) lines.push({ text: truncate(String(d.label), 46), cls: 'tt-label' });
        if (d.meta)  lines.push({ text: truncate(String(d.meta), 46),  cls: 'tt-muted' });
        lines.push({ text: `${xLabel}: ${xFmt(d.x)}`, cls: 'tt-text' });
        lines.push({ text: `${yLabel}: ${yFmt(d.y)}`, cls: 'tt-muted' });
        lines.push({ text: rankLine(d.x),             cls: 'tt-muted' });
  
        tt.selectAll('text.tt-line')
          .data(lines)
          .join('text')
            .attr('class', l => `tt-line ${l.cls}`)
            .attr('x', TT_PAD_X)
            .attr('y', (l, i) => 17 + i * TT_LINE_H)
            .attr('font-size', l => (l.cls === 'tt-label' ? '11.5px' : '10.5px'))
            .text(l => l.text);
  
        const ttW = Math.max(...lines.map(l => l.text.length)) * 6.4 + TT_PAD_X * 2;
        const ttH = lines.length * TT_LINE_H + 14;
        tt.select('.tt-bg').attr('width', ttW).attr('height', ttH);
  
        tt.raise().style('display', null);
        const [px, py] = d3.pointer(event, g.node());
        positionTooltip(px, py, ttW, ttH);
      })
      .on('pointermove', function(event) {
        const ttW = +tt.select('.tt-bg').attr('width') || 160;
        const ttH = +tt.select('.tt-bg').attr('height') || 46;
        const [px, py] = d3.pointer(event, g.node());
        positionTooltip(px, py, ttW, ttH);
      })
      .on('pointerleave', function() {
        d3.select(this)
          .attr('r', r)
          .attr('fill-opacity', autoOpacity);
        tt.style('display', 'none');
      });
  
    function positionTooltip(px, py, ttW, ttH) {
      const tx = px + ttW + 12 > innerW ? px - ttW - 8 : px + 12;
      const ty = py - ttH - 8 < 0      ? py + 8        : py - ttH - 8;
      tt.attr('transform', `translate(${tx},${ty})`);
    }
  
    // ── Axis labels ──────────────────────────────────────────────────────────
    g.append('text')
      .attr('class', 'axis-label')
      .attr('x', innerW / 2).attr('y', innerH + 44)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .text(xLabel);
  
    g.append('text')
      .attr('class', 'axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2).attr('y', -44)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .text(yLabel);
  
    // Expose in-place spread toggle — callers animate without rebuilding the SVG.
    const svgNode = svg.node();
  
    // Settled spread offsets (y − cy0, by index) — feed back as spreadSeed on the next render of
    // the SAME dataset so the new simulation refines this arrangement instead of re-rolling it.
    svgNode.spreadOffsets = spread !== null ? jNodes.map(n => n.y - n.cy0) : null;
    svgNode.setSpread = (enabled, duration = 500) => {
      circles.transition()
        .duration(duration)
        .ease(enabled ? d3.easeBackOut.overshoot(1.4) : d3.easeCubicInOut)
        .attr('cy', (_, i) => enabled ? jNodes[i].y : jNodes[i].cy0);
    };
  
    // Animate the spread from a set of incoming cy values to this render's settled spread. A pan or
    // handle release rebuilds the SVG with freshly-computed spread positions; the caller passes the
    // dots' previous cy (by index — same dataset, same order) so each dot eases from where it was to
    // where it now belongs instead of snapping. cy is set synchronously first (before paint) so there
    // is no one-frame flash at the new positions. d3.easeCubicInOut keeps it quick and smooth (no bounce).
    svgNode.springSpreadFrom = (fromCy, duration = 320) => {
      if (spread === null || !fromCy) return;
      // Set the incoming positions synchronously (before paint, so there's no flash at the new
      // spread), then start the transition on the next frame. A transition created in the same
      // synchronous block as the freshly-inserted element jumps straight to its end; deferring one
      // frame — the same way the entrance animation does — lets it actually animate.
      circles.interrupt().attr('cy', (_, i) => fromCy[i] != null ? fromCy[i] : jNodes[i].y);
      requestAnimationFrame(() => {
        circles.transition().duration(duration).ease(d3.easeCubicInOut).attr('cy', (_, i) => jNodes[i].y);
      });
    };
    return svgNode;
  }
  return createChart;
}
```

---

## Cell 15 (js)

```js
MARGIN = ({ top: 32, right: 24, bottom: 48, left: 56 });
```

---

## Cell 16 (js)

```js
CHART_CSS = (`
.chart .dot { fill: var(--dot-fill, #7070ff); }
.chart .domain,
.chart .tick line { stroke: var(--axis-color, #3a3a6a); }
.chart .tick text { fill: var(--axis-text, #a0a0c0); }
.chart .axis-label { fill: var(--label-color, #6060a0); }
.chart .tt-bg { fill: var(--tooltip-bg, #0d1a33); stroke: var(--tooltip-border, #3a3a6a); }
.chart .tt-label { fill: var(--tooltip-text, #e0e0f0); font-weight: 600; }
.chart .tt-text { fill: var(--tooltip-text, #e0e0f0); }
.chart .tt-muted { fill: var(--tooltip-text-muted, #a0a0c0); }
.chart .ruler-bg,
.chart .ruler-lbl,
.chart .pan-hint-bg,
.chart .pan-hint-text,
.chart .annot-type,
.chart .annot-value,
.chart .annot-arrow,
.chart .handle-pill,
.chart .handle-grip { fill: var(--ruler-tint, #fff); }
.chart .ruler-post,
.chart .ruler-line,
.chart .handle-line,
.chart .annot-line,
.chart .pan-hint-bg,
.chart .ruler-arrow line { stroke: var(--ruler-tint, #fff); }
.chart .ruler-arrow polygon { fill: var(--ruler-tint, #fff); }
.chart .hatch-line { stroke: var(--ruler-tint, #fff); }
.chart .annot-value { paint-order: stroke fill; stroke: var(--chart-surface, #16213e); stroke-width: 3px; }
`);
```

---

## Cell 17 (js)

```js
detectScaleType = {
  /**
   * Detects whether a dataset is better described as log-normal (use a log scale
   * end-to-end) or as a linear cluster with extreme outliers (use piecewise).
   *
   * Signal: skewness. Log-normal data has high raw skewness that collapses near
   * zero after a log transform. Clustered-outlier data stays skewed in log space
   * because the outliers are genuine extremes in both directions, not part of a
   * coherent log-normal family.
   */

  function skewness(values) {
    const n = values.length;
    if (n < 3) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    if (variance === 0) return 0;
    const std = Math.sqrt(variance);
    return values.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n;
  }

  /**
   * Returns 'log' if the data is log-normally distributed, 'piecewise' otherwise.
   *
   * Criteria for 'log':
   *   - The log transform reduces |skewness| by at least 3×
   *   - AND the residual log-skewness is below 1.5 (roughly symmetric in log space)
   *
   * @param {number[]} values  Raw positive x-values
   * @returns {'log' | 'piecewise'}
   */
  function detectScaleType(values) {
    const positive = values.filter(v => v > 0 && Number.isFinite(v));
    if (positive.length < 10) return 'piecewise';

    const rawSkew = Math.abs(skewness(positive));
    const logSkew = Math.abs(skewness(positive.map(v => Math.log(v))));

    const logReducesSkew = logSkew < rawSkew / 3;
    const logIsSymmetric = logSkew < 1.5;

    return logReducesSkew && logIsSymmetric ? 'log' : 'piecewise';
  }
  return detectScaleType;
}
```

---

## Cell 18 (js)

```js
function currencyFmt(v) {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${+(v / 1e12).toPrecision(3)}T`;
  if (abs >= 1e9)  return `$${+(v / 1e9).toPrecision(3)}B`;
  if (abs >= 1e6)  return `$${+(v / 1e6).toPrecision(3)}M`;
  if (abs >= 1e3)  return `$${+(v / 1e3).toPrecision(3)}k`;
  return `$${+v.toPrecision(3)}`;
}
```

---

## Cell 19 (js)

```js
function makeFmt(specifier) {
  return specifier === 'currency' ? currencyFmt : d3.format(specifier);
}
```

---

## Cell 20 (js)

```js
fmtMult = n => {
  if (n >= 1000) return makeFmt('~s')(n);
  if (n >= 10)   return Math.round(n).toString();
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
};

// Tick count that scales with available pixel width, budgeting ~150px per label —
// the caller's job in the d3 idiom (ticks(count) on a scale means "about this many",
// with density-vs-width tradeoffs decided by whoever owns the axis, not the scale).
```

---

## Cell 21 (js)

```js
tickCountForWidth = innerW => Math.max(3, Math.round(innerW / 150))
```

---

## Cell 22 (md)

```md
## Notes

- The linear window is **capped** so it can never swallow an outlier tail entirely — a structural guarantee (`windowBounds()`), not a heuristic, which is why no drag sequence can flatten the cluster.
- Dot spread (y-only collision, x stays exact) is **seeded across re-renders**: each simulation starts from the previous arrangement at low alpha, so dots keep their side of the cluster instead of reshuffling on every drag.
- Tick candidates are generated in magnitude space and mirrored, so negative and zero-crossing domains get proper ticks in both tails.
```

---

## Cell 23 (js)

```js
d3 = require("d3@7")
```

---

