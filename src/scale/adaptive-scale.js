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
  scale.domain     = () => outward > 0 ? [boundary, extreme] : [extreme, boundary];
  scale.range      = () => outward > 0 ? [pBoundary, pExtreme] : [pExtreme, pBoundary];
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

  // Internal scales
  let leftScale, midScale, rightScale;
  let currentXLo, currentXHi;
  let currentR1, currentR2;
  let hasLeft = false, hasRight = false;
  let tickPool = [];

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
    if (_xLoOverride != null && _xHiOverride != null) {
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

    hasLeft = lo > xMin;
    hasRight = hi < xMax;

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

    currentR1 = p1;
    currentR2 = p2;

    const windowSlope = (p2 - p1) / (currentXHi - currentXLo);

    // Build sub-scales
    leftScale  = symlogTail(currentXLo, xMin, p1, rMin, windowSlope);
    midScale   = scaleLinear().domain([currentXLo, currentXHi]).range([p1, p2]);
    rightScale = symlogTail(currentXHi, xMax, p2, rMax, windowSlope);

    // Rebuild candidate pool for stable ticks
    const set = new Set();
    const lop = xMin > 0 ? xMin : Math.max(1e-9, xMax * 1e-7);
    scaleLog().domain([lop, xMax]).ticks(100).forEach(v => set.add(v));
    scaleLinear().domain([0, xMax]).ticks(100).forEach(v => { if (v > 0) set.add(v); });
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

  const tickPriority = v => {
    if (!(v > 0)) return 0;
    const e = Math.floor(Math.log10(v) + 1e-9);
    const m = v / 10 ** e;
    const r = Math.abs(m - 1) < 1e-6 ? 4 : Math.abs(m - 5) < 1e-6 ? 3
            : Math.abs(m - 2) < 1e-6 ? 2 : Math.abs(m - Math.round(m)) < 1e-6 ? 1 : 0;
    return r * 1000 + e;
  };

  scale.ticks = function (count = 6) {
    const MIN_TICK_PX = 42;
    const [rMin, rMax] = _range;
    const [xMin, xMax] = _domain;
    const cands = new Set(tickPool);
    midScale.ticks(10).forEach(v => cands.add(v));
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
    const clone = scaleAdaptive()
      .domain(_domain.slice())
      .range(_range.slice())
      .clamp(_clamp)
      .window(_window)
      .breakpointMethod(_method)
      .data(_data.slice());
    if (_xLoOverride != null) clone.linearDomain([_xLoOverride, _xHiOverride]);
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

  scale.type = 'adaptive';

  rebuild();
  return scale;
}
