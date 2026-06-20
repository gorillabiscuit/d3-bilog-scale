import { scaleLinear, scaleLog } from 'd3-scale';
import { extent } from 'd3-array';
import { select } from 'd3-selection';
import { drag } from 'd3-drag';
import { createChart, makeFmt, MARGIN } from './base-chart.js';
import { detectScaleType } from '../scale/detect.js';
import { windowQuantile } from '../scale/window.js';

export function createAdaptiveChart(points, {
  width = 900, height = 260,
  window = 0.5,
  xFormat = '~s',
  mode,
  xLo: xLoOverride,    // explicit boundary from drag handles; undefined = use windowQuantile
  xHi: xHiOverride,
  qLo: qLoOverride,    // explicit pixel fraction [0,1] for r1; undefined = use slider
  qHi: qHiOverride,    // explicit pixel fraction [0,1] for r2; undefined = use slider
  onWindowDrag,        // callback({ xLo, xHi }) fired on every drag move (lightweight)
  onWindowChange,      // callback({ xLo, xHi, qLo?, qHi? }) fired on dragend (triggers re-render)
  tailTicks = 6,       // max ruler lines in each tail
  overlayColor = 'white',
  tickColor = 'white',
  chartBg,             // chart background color for text halo on span annotation
  ...options
} = {}) {
  if (!points?.length) return document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const resolvedMode = mode ?? detectScaleType(points.map(d => d.x));

  return resolvedMode === 'log'
    ? renderLog(points, { width, height, xFormat, ...options })
    : renderPiecewise(points, {
        width, height, window, xFormat,
        xLoOverride, xHiOverride, qLoOverride, qHiOverride, onWindowDrag, onWindowChange,
        tailTicks, overlayColor, tickColor, chartBg,
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
  xLoOverride, xHiOverride, qLoOverride, qHiOverride, onWindowDrag, onWindowChange,
  tailTicks, overlayColor, tickColor, chartBg,
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

  // Pixel allocation: use handle-drag overrides when present, else slider-derived
  const qLo = qLoOverride ?? Math.max(0, 0.5 - window / 2);
  const qHi = qHiOverride ?? Math.min(1, 0.5 + window / 2);

  const r0 = 0;
  const r1 = innerW * qLo;
  const r2 = innerW * qHi;
  const r3 = innerW;

  // scaleLog requires strictly positive domain values; clamp xMin away from zero
  // so datasets with a $0 minimum don't break the log tail.
  const logMin = xMin > 0 ? xMin : xMax * 1e-6;

  const buildScales = (lo, hi, p1, p2) => ({
    leftScale:  scaleLog().domain([logMin, lo]).range([r0, p1]),
    midScale:   scaleLinear().domain([lo, hi]).range([p1, p2]),
    rightScale: scaleLog().domain([hi, xMax]).range([p2, r3]),
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
    // Always include xMax so the axis labels the right data boundary.
    // Then cull any tick whose pixel position is within 20px of the previous one —
    // sub-scale boundaries and the explicit xMax can produce near-duplicates.
    const raw = [...tl, ...tm, ...tr, xMax];
    const MIN_TICK_PX = 20;
    const culled = [];
    let lastPx = -Infinity;
    for (const v of raw) {
      const px = xScale(v);
      if (px - lastPx >= MIN_TICK_PX) { culled.push(v); lastPx = px; }
    }
    return culled;
  };
  // Invert is needed for drag handles: pixel → domain value
  xScale.invert = px => {
    const p = Math.max(r0, Math.min(r3, px));
    if (p <= r1) return leftScale.invert(p);
    if (p <= r2) return midScale.invert(p);
    return rightScale.invert(p);
  };
  // d3-axis calls scale.tickFormat(count, specifier) when no explicit formatter is set.
  // Delegate to the linear mid-section — it determines the "natural" numeric precision.
  xScale.tickFormat = (count, specifier) => midScale.tickFormat(count, specifier);

  const node = createChart(points, xScale, { width, height, xFormat, ...options });
  const g = select(node).select('g');

  // Overlay on linear region — lowered below dots so dots still get pointer
  // events for tooltips. Drag is attached here so clicks on empty space in the
  // linear region trigger the pan while clicks on dots reach the dot handlers.
  const overlay = g.append('rect')
      .attr('x', r1).attr('width', Math.max(0, r2 - r1))
      .attr('y', 0).attr('height', innerH)
      .attr('fill', overlayColor).attr('fill-opacity', 0.07)
      .attr('tabindex', '0')
      .attr('role', 'slider')
      .attr('aria-label', 'Pan linear section — arrow keys to move, Shift for larger steps')
      .style('outline', 'none')
    .lower();

  // Pan hint — appears at top and bottom of the linear section, fades after 3 s
  const hintText = '← drag to pan →';
  const hintFontSize = 10;
  const hintPadX = 9, hintPadY = 4;
  const hintW = hintText.length * 5.5 + hintPadX * 2;
  const hintH = hintFontSize + hintPadY * 2;
  const hintX = (r1 + r2) / 2;

  [hintH / 2 + 4, innerH - hintH / 2 - 4].forEach(cy => {
    const hg = g.append('g').attr('pointer-events', 'none').style('opacity', 0.9);
    hg.append('rect')
      .attr('x', hintX - hintW / 2).attr('y', cy - hintH / 2)
      .attr('width', hintW).attr('height', hintH).attr('rx', hintH / 2)
      .attr('fill', tickColor).attr('fill-opacity', 0.12)
      .attr('stroke', tickColor).attr('stroke-opacity', 0.3).attr('stroke-width', 1);
    hg.append('text')
      .attr('x', hintX).attr('y', cy + hintFontSize * 0.35)
      .attr('text-anchor', 'middle')
      .attr('fill', tickColor).attr('fill-opacity', 0.65)
      .attr('font-size', `${hintFontSize}px`)
      .text(hintText);
    hg.style('transition', 'opacity 0.8s');
    setTimeout(() => {
      hg.style('opacity', 0);
      setTimeout(() => hg.remove(), 800);
    }, 3000);
  });

  // Ruler tick lines: one linear-window-width step into each tail
  // Kept in a dedicated group so they can be cleared and redrawn during drag.
  const tickGroup = g.append('g').attr('pointer-events', 'none');

  // Use each sub-scale's own .ticks() to generate ruler lines.
  // Domain-linear stepping fails when the tail spans orders of magnitude more
  // than the linear window (first step collapses to <2px from the boundary).
  // The sub-scale's ticks() spans the full tail range and always produces visible lines.
  function redrawTicks(leftSub, rightSub) {
    tickGroup.selectAll('line').remove();
    if (tailTicks === 0) return;

    const [leftMin, curXLo] = leftSub.domain();
    const [curXHi, rightMax] = rightSub.domain();

    // Place tick lines at equal dollar-step intervals — one linear-window-width per step.
    // On the log sub-scale these compress toward the extremes, visually demonstrating
    // that each interval covers the same dollar range as the linear section but in
    // progressively fewer pixels. That's the point: the viewer sees the compression.
    const windowSpan = curXHi - curXLo;

    for (let i = 1; i <= tailTicks; i++) {
      const v = curXLo - i * windowSpan;
      if (v <= leftMin) break;
      tickGroup.append('line')
        .attr('x1', leftSub(v)).attr('x2', leftSub(v)).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', tickColor).attr('stroke-opacity', 0.25).attr('stroke-width', 1);
    }
    for (let i = 1; i <= tailTicks; i++) {
      const v = curXHi + i * windowSpan;
      if (v >= rightMax) break;
      tickGroup.append('line')
        .attr('x1', rightSub(v)).attr('x2', rightSub(v)).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', tickColor).attr('stroke-opacity', 0.25).attr('stroke-width', 1);
    }
  }

  redrawTicks(leftScale, rightScale);

  // ── Region annotations ────────────────────────────────────────────────────
  // Permanent dimension-line annotations: one per scale region, always visible.
  // Shows the type label ("power" / "linear") above and the data range below.
  const ANNOT_Y   = 24;   // y of the dimension line
  const ANNOT_ARR = 5;    // arrowhead length in px
  const annotFmt  = makeFmt(xFormat);

  function makeAnnotation(typeLabel) {
    const grp = g.append('g').attr('pointer-events', 'none');

    grp.append('text')
      .attr('class', 'annot-type').attr('y', 8).attr('text-anchor', 'middle')
      .attr('fill', tickColor).attr('fill-opacity', 0.3)
      .attr('font-size', '9px').attr('font-style', 'italic')
      .text(typeLabel);

    const valueTxt = grp.append('text')
      .attr('class', 'annot-value').attr('y', ANNOT_Y - 2).attr('text-anchor', 'middle')
      .attr('fill', tickColor).attr('fill-opacity', 0.65)
      .attr('font-size', '10px').attr('font-weight', '500')
      .style('paint-order', 'stroke fill');
    if (chartBg) valueTxt.attr('stroke', chartBg).attr('stroke-width', 3);

    const dimLine = grp.append('line')
      .attr('y1', ANNOT_Y).attr('y2', ANNOT_Y)
      .attr('stroke', tickColor).attr('stroke-opacity', 0.45).attr('stroke-width', 1);
    const arrL = grp.append('polygon').attr('fill', tickColor).attr('fill-opacity', 0.45);
    const arrR = grp.append('polygon').attr('fill', tickColor).attr('fill-opacity', 0.45);

    return function update(p1, p2, lo, hi) {
      if (p2 - p1 < 2 * ANNOT_ARR + 28) { grp.style('display', 'none'); return; }
      grp.style('display', null);
      const cx = (p1 + p2) / 2;
      grp.select('.annot-type').attr('x', cx);
      valueTxt.attr('x', cx).text(annotFmt(hi - lo));
      dimLine.attr('x1', p1 + ANNOT_ARR).attr('x2', p2 - ANNOT_ARR);
      arrL.attr('points', `${p1},${ANNOT_Y} ${p1+ANNOT_ARR},${ANNOT_Y-3} ${p1+ANNOT_ARR},${ANNOT_Y+3}`);
      arrR.attr('points', `${p2},${ANNOT_Y} ${p2-ANNOT_ARR},${ANNOT_Y-3} ${p2-ANNOT_ARR},${ANNOT_Y+3}`);
    };
  }

  const updateLeftAnnot   = makeAnnotation('log');
  const updateLinearAnnot = makeAnnotation('linear');
  const updateRightAnnot  = makeAnnotation('log');

  updateLeftAnnot(r0, r1, xMin, xLo);
  updateLinearAnnot(r1, r2, xLo, xHi);
  updateRightAnnot(r2, r3, xHi, xMax);

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
      redrawTicks(s.leftScale, rightScale);
      updateLeftAnnot(r0, px, xMin, newXLo);
      updateLinearAnnot(px, r2, newXLo, xHi);
      onWindowDrag?.({ xLo: newXLo, xHi });
      return newXLo;
    }

    function applyRightDrag(px) {
      const newXHi = xScale.invert(px);
      const s = buildScales(xLo, newXHi, r1, px);
      const liveScale = v => v <= xLo ? leftScale(v) : v <= newXHi ? s.midScale(v) : s.rightScale(v);
      circles.attr('cx', d => liveScale(d.x));
      overlay.attr('width', Math.max(0, px - r1));
      redrawTicks(leftScale, s.rightScale);
      updateLinearAnnot(r1, px, xLo, newXHi);
      updateRightAnnot(px, r3, newXHi, xMax);
      onWindowDrag?.({ xLo, xHi: newXHi });
      return newXHi;
    }

    function makeHandle(initialPx, side) {
      const label = side === 'left' ? 'Left boundary — arrow keys to move' : 'Right boundary — arrow keys to move';
      const handle = g.append('g')
        .attr('class', `handle handle-${side}`)
        .attr('transform', `translate(${initialPx},0)`)
        .style('cursor', 'col-resize')
        .style('outline', 'none')   // suppress browser focus ring; pill provides the visual
        .attr('tabindex', '0')
        .attr('role', 'slider')
        .attr('aria-label', label);

      // Invisible stroke-only hit line — 8px wide so the handle is easy to grab,
      // but pointer-events: stroke means dots that aren't directly on the line
      // still receive their own tooltip events (fall-through to elements below).
      handle.append('line')
        .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', 'transparent').attr('stroke-width', 8)
        .style('pointer-events', 'stroke');

      // Thin full-height boundary line (visual only, no pointer events)
      handle.append('line')
        .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', tickColor).attr('stroke-width', 1).attr('stroke-opacity', 0.3)
        .style('pointer-events', 'none');

      // Pill capsule centred vertically — the react-resizable-panels drag handle idiom
      const pillW = 8, pillH = 20;
      const pillY  = innerH / 2 - pillH / 2;
      const pill = handle.append('rect')
        .attr('x', -pillW / 2).attr('y', pillY)
        .attr('width', pillW).attr('height', pillH)
        .attr('rx', pillW / 2)
        .attr('fill', tickColor).attr('fill-opacity', 0.22);

      // 2 × 3 grab-dot grid inside the pill
      [-2, 2].forEach(cx =>
        [-5, 0, 5].forEach(dy =>
          handle.append('circle')
            .attr('cx', cx).attr('cy', innerH / 2 + dy)
            .attr('r', 1)
            .attr('fill', tickColor).attr('fill-opacity', 0.6)
        )
      );

      // Hover / focus: brighten pill + line
      handle.on('mouseenter focus', () => {
        pill.attr('fill-opacity', 0.55);
        handle.select('line').attr('stroke-opacity', 0.6);
      });
      handle.on('mouseleave blur', () => {
        pill.attr('fill-opacity', 0.22);
        handle.select('line').attr('stroke-opacity', 0.3);
      });

      return handle;
    }

    let currentXLo = xLo, currentXHi = xHi;
    let currentR1 = r1, currentR2 = r2;
    let finalR1 = r1, finalR2 = r2;

    // Declare handles up front so the panZone drag closure can reference them
    // even though the DOM nodes are created below.
    let leftHandle, rightHandle;

    // Pan: the box moves in pixel space; xScale.invert maps new pixel positions
    // back to domain values each frame. Data stays put, the window slides over it.
    const boxW = r2 - r1;
    let panStartX = 0;

    overlay.call(drag()
      .on('start', event => {
        panStartX = event.x;
        overlay.style('cursor', 'grabbing');
      })
      .on('drag', event => {
        const newR1 = Math.max(r0, Math.min(r3 - boxW, r1 + (event.x - panStartX)));
        const newR2 = newR1 + boxW;
        const newXLo = xScale.invert(newR1);
        const newXHi = xScale.invert(newR2);
        const s = buildScales(newXLo, newXHi, newR1, newR2);
        const liveScale = v => v <= newXLo ? s.leftScale(v) : v <= newXHi ? s.midScale(v) : s.rightScale(v);
        circles.attr('cx', d => liveScale(d.x));
        overlay.attr('x', newR1).attr('width', boxW);
        leftHandle?.attr('transform', `translate(${newR1},0)`);
        rightHandle?.attr('transform', `translate(${newR2},0)`);
        redrawTicks(s.leftScale, s.rightScale);
        updateLeftAnnot(r0, newR1, xMin, newXLo);
        updateLinearAnnot(newR1, newR2, newXLo, newXHi);
        updateRightAnnot(newR2, r3, newXHi, xMax);
        onWindowDrag?.({ xLo: newXLo, xHi: newXHi });
        currentXLo = newXLo; currentXHi = newXHi;
        currentR1 = newR1;   currentR2 = newR2;
      })
      .on('end', () => {
        overlay.style('cursor', null);
        onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
    );

    leftHandle  = makeHandle(r1, 'left');
    rightHandle = makeHandle(r2, 'right');

    // Keyboard step: 5px normal, 2% of chart width with Shift
    const kbStep = event => event.shiftKey ? innerW * 0.02 : 5;

    leftHandle.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const px = Math.max(r0, Math.min(currentR2 - MIN_WINDOW_PX, currentR1 + dir * kbStep(event)));
      // Treat left-boundary drag the same way the mouse drag does:
      // applyLeftDrag rebuilds scales live; then commit via onWindowChange.
      // We synthesise finalR1 here so the dragend path is consistent.
      finalR1 = px;
      currentXLo = applyLeftDrag(px);
      leftHandle.attr('transform', `translate(${px},0)`)
                .attr('aria-valuenow', currentXLo);
      currentR1 = px;
      onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: px / innerW, qHi: currentR2 / innerW });
    });

    rightHandle.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const px = Math.max(currentR1 + MIN_WINDOW_PX, Math.min(r3, currentR2 + dir * kbStep(event)));
      finalR2 = px;
      currentXHi = applyRightDrag(px);
      rightHandle.attr('transform', `translate(${px},0)`)
                 .attr('aria-valuenow', currentXHi);
      currentR2 = px;
      onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: px / innerW });
    });

    overlay.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const newR1 = Math.max(r0, Math.min(r3 - boxW, currentR1 + dir * kbStep(event)));
      const newR2 = newR1 + boxW;
      const newXLo = xScale.invert(newR1);
      const newXHi = xScale.invert(newR2);
      const s = buildScales(newXLo, newXHi, newR1, newR2);
      const liveScale = v => v <= newXLo ? s.leftScale(v) : v <= newXHi ? s.midScale(v) : s.rightScale(v);
      circles.attr('cx', d => liveScale(d.x));
      overlay.attr('x', newR1).attr('width', boxW);
      leftHandle?.attr('transform', `translate(${newR1},0)`);
      rightHandle?.attr('transform', `translate(${newR2},0)`);
      redrawTicks(s.leftScale, s.rightScale);
      onWindowDrag?.({ xLo: newXLo, xHi: newXHi });
      currentXLo = newXLo; currentXHi = newXHi;
      currentR1 = newR1;   currentR2 = newR2;
      onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
    });

    leftHandle.call(drag()
      .on('drag', event => {
        const px = Math.max(r0, Math.min(r2 - MIN_WINDOW_PX, event.x));
        finalR1 = px;
        currentXLo = applyLeftDrag(px);
        leftHandle.attr('transform', `translate(${px},0)`);
      })
      .on('end', () => {
        onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: finalR1 / innerW, qHi: qHi });
      })
    );

    rightHandle.call(drag()
      .on('drag', event => {
        const px = Math.max(r1 + MIN_WINDOW_PX, Math.min(r3, event.x));
        finalR2 = px;
        currentXHi = applyRightDrag(px);
        rightHandle.attr('transform', `translate(${px},0)`);
      })
      .on('end', () => {
        onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: qLo, qHi: finalR2 / innerW });
      })
    );
  }

  return node;
}
