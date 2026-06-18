import { scaleLog, scaleLinear } from 'd3-scale';
import { min, max } from 'd3-array';
import { detectBreakpoints } from './breakpoints.js';
import { generateTicks } from './ticks.js';

const EPSILON = 1e-10; // guard against log(0)

export function scaleAdaptive() {
  let _domain = [1, 100];
  let _range = [0, 1];
  let _data = [];
  let _method = 'iqr';
  let _alpha = 0.15; // blend factor: 1 = equal thirds, 0 = pure density-weighted
  let _clamp = false;

  // Derived — rebuilt whenever domain/range/data changes
  let _regions = []; // [{type, domain, range, pixels, scale}]

  function rebuild() {
    const [dMin, dMax] = _domain;
    const [rMin, rMax] = _range;
    const totalPixels = rMax - rMin;

    // Need data to compute breakpoints; fall back to pure linear
    if (_data.length < 2 || dMin >= dMax) {
      const s = scaleLinear().domain(_domain).range(_range);
      _regions = [{ type: 'linear', domain: _domain, range: _range, pixels: totalPixels, scale: s }];
      return;
    }

    const { left: bL, right: bR } = detectBreakpoints(_data, _method);

    const hasLeft = bL > dMin;
    const hasRight = bR < dMax;

    // Count data points in each region
    const nL = hasLeft ? _data.filter((v) => v < bL).length : 0;
    const nM = _data.filter((v) => v >= bL && v <= bR).length;
    const nR = hasRight ? _data.filter((v) => v > bR).length : 0;
    const n = _data.length;

    // Balanced allocation: 50% equal thirds, 50% density-weighted
    let pL = hasLeft ? _alpha * (1 / 3) + (1 - _alpha) * (nL / n) : 0;
    let pM = _alpha * (1 / 3) + (1 - _alpha) * (nM / n);
    let pR = hasRight ? _alpha * (1 / 3) + (1 - _alpha) * (nR / n) : 0;

    // Normalise to sum = 1
    const total = pL + pM + pR;
    pL /= total;
    pM /= total;
    pR /= total;

    const wL = totalPixels * pL;
    const wM = totalPixels * pM;
    const wR = totalPixels * pR;

    _regions = [];

    if (hasLeft) {
      const safeDMin = dMin <= 0 ? EPSILON : dMin;
      const safeBL = bL <= 0 ? EPSILON : bL;
      _regions.push({
        type: 'log',
        domain: [dMin, bL],
        range: [rMin, rMin + wL],
        pixels: wL,
        scale: scaleLog().domain([safeDMin, safeBL]).range([rMin, rMin + wL]),
      });
    }

    const middleRangeStart = rMin + wL;
    _regions.push({
      type: 'linear',
      domain: [bL, bR],
      range: [middleRangeStart, middleRangeStart + wM],
      pixels: wM,
      scale: scaleLinear().domain([bL, bR]).range([middleRangeStart, middleRangeStart + wM]),
    });

    if (hasRight) {
      const safeBR = bR <= 0 ? EPSILON : bR;
      const safeDMax = dMax <= 0 ? EPSILON : dMax;
      _regions.push({
        type: 'log',
        domain: [bR, dMax],
        range: [middleRangeStart + wM, rMax],
        pixels: wR,
        scale: scaleLog().domain([safeBR, safeDMax]).range([middleRangeStart + wM, rMax]),
      });
    }
  }

  function regionFor(v) {
    // Walk from right so the right boundary is exclusive on the right region
    for (let i = _regions.length - 1; i >= 0; i--) {
      if (v >= _regions[i].domain[0]) return _regions[i];
    }
    return _regions[0];
  }

  function scale(v) {
    if (_clamp) v = Math.max(_domain[0], Math.min(_domain[1], v));
    const region = regionFor(v);
    // Guard log(0) — replace with epsilon before passing to sub-scale
    const safeV = region.type === 'log' && v <= 0 ? EPSILON : v;
    return region.scale(safeV);
  }

  scale.invert = function (p) {
    const region = _regions.find((r) => p <= r.range[1]) ?? _regions[_regions.length - 1];
    return region.scale.invert(p);
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

  scale.breakpointMethod = function (m) {
    if (!arguments.length) return _method;
    _method = m;
    rebuild();
    return scale;
  };

  scale.allocAlpha = function (a) {
    if (!arguments.length) return _alpha;
    _alpha = +a;
    rebuild();
    return scale;
  };

  scale.clamp = function (c) {
    if (!arguments.length) return _clamp;
    _clamp = !!c;
    return scale;
  };

  scale.ticks = function (count = 10) {
    const raw = generateTicks(_regions, _range[1] - _range[0]);
    // Remove ticks that would render within MIN_GAP pixels of the previous one.
    const MIN_GAP = 72;
    const filtered = [];
    let lastPx = -Infinity;
    for (const v of raw) {
      const px = scale(v);
      if (px - lastPx >= MIN_GAP) {
        filtered.push(v);
        lastPx = px;
      }
    }
    return filtered;
  };

  scale.tickFormat = function (count, specifier) {
    return formatValue;
  };

  scale.copy = function () {
    return scaleAdaptive()
      .domain(_domain.slice())
      .range(_range.slice())
      .clamp(_clamp)
      .breakpointMethod(_method)
      .allocAlpha(_alpha)
      .data(_data.slice());
  };

  scale.type = 'adaptive';

  // Returns region descriptors — useful for rendering compression indicators
  scale.regions = function () {
    return _regions.map((r) => ({ type: r.type, domain: r.domain, range: r.range, pixels: r.pixels }));
  };

  return scale;
}

function formatValue(v) {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${+(v / 1e12).toPrecision(3)}T`;
  if (abs >= 1e9) return `${+(v / 1e9).toPrecision(3)}B`;
  if (abs >= 1e6) return `${+(v / 1e6).toPrecision(3)}M`;
  if (abs >= 1e3) return `${+(v / 1e3).toPrecision(3)}k`;
  if (abs >= 1) return `${+v.toPrecision(3)}`;
  if (abs >= 0.01) return `${+v.toPrecision(2)}`;
  return v.toExponential(1);
}
