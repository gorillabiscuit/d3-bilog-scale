import { scalePow, scaleLinear, scaleLog } from 'd3-scale';
import { extent } from 'd3-array';
import { select } from 'd3-selection';
import { drag } from 'd3-drag';
import { format } from 'd3-format';
import { createChart, MARGIN } from './base-chart.js';
import { detectScaleType } from '../scale/detect.js';
import { windowQuantile } from '../scale/window.js';

function makeFmt(specifier) {
  if (specifier === 'currency') {
    return v => {
      const abs = Math.abs(v);
      if (abs >= 1e9)  return `$${+(v / 1e9).toPrecision(3)}B`;
      if (abs >= 1e6)  return `$${+(v / 1e6).toPrecision(3)}M`;
      if (abs >= 1e3)  return `$${+(v / 1e3).toPrecision(3)}k`;
      return `$${+v.toPrecision(3)}`;
    };
  }
  return format(specifier);
}

export function createAdaptiveChart(points, {
  width = 900, height = 260,
  window = 0.5,
  xFormat = '~s',
  mode,
  xLo: xLoOverride,    // explicit boundary from drag handles; undefined = use windowQuantile
  xHi: xHiOverride,
  onWindowDrag,        // callback({ xLo, xHi }) fired on every drag move (lightweight)
  onWindowChange,      // callback({ xLo, xHi }) fired on handle dragend (triggers re-render)
  ...options
} = {}) {
  if (!points?.length) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const resolvedMode = mode ?? detectScaleType(points.map(d => d.x));

  return resolvedMode === 'log'
    ? renderLog(points, { width, height, xFormat, ...options })
    : renderPiecewise(points, {
        width, height, window, xFormat,
        xLoOverride, xHiOverride, onWindowDrag, onWindowChange,
        ...options,
      });
}

// ── Log mode ──────────────────────────────────────────────────────────────────

function renderLog(points, { width, height, xFormat, ...options }) {
  const [xMin, xMax] = extent(points, d => d.x);
  const innerW = width  - MARGIN.left - MARGIN.right;
  const xScale = scaleLog().domain([xMin, xMax]).range([0, innerW]).nice();
  return createChart(points, xScale, { width, height, xFormat, ...options });
}

// ── Piecewise mode ────────────────────────────────────────────────────────────

const MIN_WINDOW_PX = 20; // minimum pixel width of the linear region

function renderPiecewise(points, {
  width, height, window, xFormat,
  xLoOverride, xHiOverride, onWindowDrag, onWindowChange,
  ...options
}) {
  const innerW = width  - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top  - MARGIN.bottom;
  const [xMin, xMax] = extent(points, d => d.x);
  const xValues = points.map(d => d.x);

  // Use drag-handle overrides when present, otherwise quantile from slider
  const { xLo: rawLo, xHi: rawHi } =
    xLoOverride != null && xHiOverride != null
      ? { xLo: xLoOverride, xHi: xHiOverride }
      : windowQuantile(xValues, window);

  const eps = (xMax - xMin) * 1e-9;
  const xLo = Math.max(xMin + eps, Math.min(rawLo, xMax - 2 * eps));
  const xHi = Math.min(xMax - eps, Math.max(rawHi, xMin + 2 * eps));
  if (xLo >= xHi) return renderLog(points, { width, height, xFormat, ...options });

  // Pixel allocation: linear region centered symmetrically (slider-derived)
  const qLo = Math.max(0, 0.5 - window / 2);
  const qHi = Math.min(1, 0.5 + window / 2);

  const r0 = 0;
  const r1 = innerW * qLo;
  const r2 = innerW * qHi;
  const r3 = innerW;

  const buildScales = (lo, hi, p1, p2) => ({
    leftScale:  scalePow().exponent(0.3).domain([xMin, lo]).range([r0, p1]),
    midScale:   scaleLinear().domain([lo, hi]).range([p1, p2]),
    rightScale: scalePow().exponent(0.3).domain([hi, xMax]).range([p2, r3]),
  });

  let { leftScale, midScale, rightScale } = buildScales(xLo, xHi, r1, r2);

  function xScale(v) {
    if (v <= xLo) return leftScale(v);
    if (v <= xHi) return midScale(v);
    return rightScale(v);
  }
  xScale.domain = () => [xMin, xMax];
  xScale.range  = () => [0, innerW];
  xScale.copy   = () => xScale;
  xScale.ticks  = (count = 8) => {
    const tl = qLo > 0 ? leftScale.ticks(Math.max(1, Math.round(count * qLo)))          : [];
    const tm =            midScale.ticks(Math.max(1, Math.round(count * (qHi - qLo))));
    const tr = qHi < 1 ? rightScale.ticks(Math.max(1, Math.round(count * (1 - qHi))))   : [];
    return [...tl, ...tm, ...tr];
  };
  // Invert is needed for drag handles: pixel → domain value
  xScale.invert = px => {
    const p = Math.max(r0, Math.min(r3, px));
    if (p <= r1) return leftScale.invert(p);
    if (p <= r2) return midScale.invert(p);
    return rightScale.invert(p);
  };

  const node = createChart(points, xScale, { width, height, xFormat, ...options });
  const g = select(node).select('g');

  // White overlay on linear region
  const overlay = g.append('rect')
      .attr('x', r1).attr('width', Math.max(0, r2 - r1))
      .attr('y', 0).attr('height', innerH)
      .attr('fill', 'white').attr('fill-opacity', 0.07)
      .attr('pointer-events', 'none')
    .lower();

  // Ruler tick lines: one linear-window-width step into each tail
  // Kept in a dedicated group so they can be cleared and redrawn during drag.
  const MAX_TAIL_TICKS = 6;
  const tickGroup = g.append('g').attr('pointer-events', 'none');

  function redrawTicks(lo, hi, scaleFn, p1, p2) {
    tickGroup.selectAll('line').remove();
    const step = hi - lo;
    let lc = lo - step, ln = 0;
    while (lc > xMin && ln < MAX_TAIL_TICKS) {
      const px = scaleFn(lc);
      if (p1 - px < 1) break;
      tickGroup.append('line')
        .attr('x1', px).attr('x2', px).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', 'white').attr('stroke-opacity', 0.25).attr('stroke-width', 1);
      lc -= step; ln++;
    }
    let rc = hi + step, rn = 0;
    while (rc < xMax && rn < MAX_TAIL_TICKS) {
      const px = scaleFn(rc);
      if (px - p2 < 1) break;
      tickGroup.append('line')
        .attr('x1', px).attr('x2', px).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', 'white').attr('stroke-opacity', 0.25).attr('stroke-width', 1);
      rc += step; rn++;
    }
  }

  redrawTicks(xLo, xHi, xScale, r1, r2);

  // ── Drag handles ─────────────────────────────────────────────────────────────
  if (onWindowChange) {
    const circles = g.selectAll('circle');

    // Rebuilds left+mid scales from a new left boundary pixel position
    // and updates circles + overlay in place — no full re-render needed during drag.
    function applyLeftDrag(px) {
      const newXLo = xScale.invert(px);
      const s = buildScales(newXLo, xHi, px, r2);
      const liveScale = v => v <= newXLo ? s.leftScale(v) : v <= xHi ? s.midScale(v) : rightScale(v);
      circles.attr('cx', d => liveScale(d.x));
      overlay.attr('x', px).attr('width', Math.max(0, r2 - px));
      redrawTicks(newXLo, xHi, liveScale, px, r2);
      onWindowDrag?.({ xLo: newXLo, xHi });
      return newXLo;
    }

    function applyRightDrag(px) {
      const newXHi = xScale.invert(px);
      const s = buildScales(xLo, newXHi, r1, px);
      const liveScale = v => v <= xLo ? leftScale(v) : v <= newXHi ? s.midScale(v) : s.rightScale(v);
      circles.attr('cx', d => liveScale(d.x));
      overlay.attr('width', Math.max(0, px - r1));
      redrawTicks(xLo, newXHi, liveScale, r1, px);
      onWindowDrag?.({ xLo, xHi: newXHi });
      return newXHi;
    }

    function makeHandle(initialPx, side) {
      const handle = g.append('g')
        .attr('class', `handle handle-${side}`)
        .attr('transform', `translate(${initialPx},0)`)
        .style('cursor', 'ew-resize');

      // Invisible wide hit area for easy grabbing
      handle.append('rect')
        .attr('x', -8).attr('width', 16)
        .attr('y', 0).attr('height', innerH)
        .attr('fill', 'transparent');

      // Visible boundary line
      handle.append('line')
        .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', 'white').attr('stroke-width', 1.5).attr('stroke-opacity', 0.5);

      // Grip dots centred vertically
      const mid = innerH / 2;
      [-6, 0, 6].forEach(dy =>
        handle.append('circle')
          .attr('cy', mid + dy).attr('r', 1.5)
          .attr('fill', 'white').attr('fill-opacity', 0.5)
      );

      // Highlight on hover
      handle.on('mouseenter', () => handle.select('line').attr('stroke-opacity', 1))
            .on('mouseleave', () => handle.select('line').attr('stroke-opacity', 0.5));

      return handle;
    }

    let currentXLo = xLo, currentXHi = xHi;

    const leftHandle  = makeHandle(r1, 'left');
    const rightHandle = makeHandle(r2, 'right');

    leftHandle.call(drag()
      .on('drag', event => {
        const px = Math.max(r0, Math.min(r2 - MIN_WINDOW_PX, event.x));
        currentXLo = applyLeftDrag(px);
        leftHandle.attr('transform', `translate(${px},0)`);
      })
      .on('end', () => onWindowChange({ xLo: currentXLo, xHi: currentXHi }))
    );

    rightHandle.call(drag()
      .on('drag', event => {
        const px = Math.max(r1 + MIN_WINDOW_PX, Math.min(r3, event.x));
        currentXHi = applyRightDrag(px);
        rightHandle.attr('transform', `translate(${px},0)`);
      })
      .on('end', () => onWindowChange({ xLo: currentXLo, xHi: currentXHi }))
    );
  }

  return node;
}
