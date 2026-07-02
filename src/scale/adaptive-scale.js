import { scaleLinear, scaleSymlog, scaleLog } from 'd3-scale';
import { min, max } from 'd3-array';
import { windowQuantile } from './window.js';
import { detectBreakpoints } from './breakpoints.js';

export function solveSymlogConstant(A, S, T) {
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

export function symlogTail(boundary, extreme, pBoundary, pExtreme, windowSlope) {
  const span    = Math.abs(extreme - boundary) || 1;
  const outward = Math.sign(extreme - boundary) || 1; // +1 right tail, −1 left tail
  const base    = scaleSymlog().domain([0, span]).range([pBoundary, pExtreme]);
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

export function scaleAdaptive() {
  let _domain = [1, 100];
  let _range = [0, 1];
  let _data = [];
  let _window = 0.5; // slider fraction [0, 1]
  let _clamp = false;
  let _method = 'iqr'; // breakpoint detection method ('iqr' or 'quantile')

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
      const s = scaleLinear().domain(_domain).range(_range);
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
      const s = scaleLinear().domain([xMin, xMax]).range([rMin, rMax]);
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
    midScale   = scaleLinear().domain([currentXLo, currentXHi]).range([p1, p2]);
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
      scaleLog().domain([Math.max(magMin, 1e-9), magMax]).ticks(100).forEach(v => {
        if (v >= xMin && v <= xMax) set.add(v);
        if (-v >= xMin && -v <= xMax) set.add(-v);
      });
    }
    scaleLinear().domain([xMin, xMax]).ticks(100).forEach(v => { if (v !== 0) set.add(v); });
    tickPool = [...set];
  }

  function scale(v) {
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
      _domain = [min(_data), max(_data)];
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

  rebuild();
  return scale;
}
