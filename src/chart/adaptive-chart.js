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
const BAND_MIN_PX   = 2;  // hatch lines closer than this merge into solid fill
let   _hatchInstId  = 0;  // unique id per chart instance for clip path refs

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

  // Per-instance clip paths so diagonal hatch lines don't bleed into the linear region.
  // Rect dimensions are updated dynamically by redrawHatch on every drag event.
  const hatchInstId   = ++_hatchInstId;
  const svgDefs       = select(node).select('defs');
  const leftClipRect  = svgDefs.append('clipPath').attr('id', `hatch-left-${hatchInstId}`)
    .append('rect').attr('x', r0).attr('y', 0).attr('width', r1 - r0).attr('height', innerH);
  const rightClipRect = svgDefs.append('clipPath').attr('id', `hatch-right-${hatchInstId}`)
    .append('rect').attr('x', r2).attr('y', 0).attr('width', r3 - r2).attr('height', innerH);

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

  // Diagonal hatch lines at equal dollar-step intervals across each tail.
  // Lines are placed at window-span domain steps — identical to the bunched reference
  // lines approach but drawn at 45° so they read as texture rather than ruler marks.
  // Because the sub-scales are logarithmic, equal domain steps compress toward the
  // extremes, making the hatching visibly denser where the scale is most compressed.
  // When adjacent lines are sub-pixel apart we switch to a solid fill rectangle.
  const HATCH_DX   = innerH; // 45° diagonal: x-offset equals chart height
  const hatchGroup = g.append('g').attr('pointer-events', 'none');
  // Raise dots above the hatch so data is always legible through the texture.
  g.selectAll('circle').raise();

  function redrawHatch(leftSub, rightSub) {
    hatchGroup.selectAll('*').remove();

    const [leftMin, curXLo] = leftSub.domain();
    const [curXHi, rightMax] = rightSub.domain();
    const windowSpan = curXHi - curXLo;
    const curR1 = leftSub.range()[1];
    const curR2 = rightSub.range()[0];

    // Keep clip rects in sync with the current handle positions.
    leftClipRect.attr('width', curR1 - r0);
    rightClipRect.attr('x', curR2).attr('width', r3 - curR2);

    const leftG  = hatchGroup.append('g').attr('clip-path', `url(#hatch-left-${hatchInstId})`);
    const rightG = hatchGroup.append('g').attr('clip-path', `url(#hatch-right-${hatchInstId})`);

    // Left tail — iterate inward from the boundary toward the extreme.
    let prevPx = curR1;
    let leftLines = 0;
    for (let v = curXLo - windowSpan; v > leftMin; v -= windowSpan) {
      const px = leftSub(v);
      if (prevPx - px < BAND_MIN_PX) {
        leftG.append('rect')
          .attr('x', r0).attr('width', Math.max(1, px - r0))
          .attr('y', 0).attr('height', innerH)
          .attr('fill', tickColor).attr('fill-opacity', 0.22);
        leftLines++;
        break;
      }
      leftG.append('line')
        .attr('x1', px).attr('y1', 0)
        .attr('x2', px + HATCH_DX).attr('y2', innerH)
        .attr('stroke', tickColor).attr('stroke-opacity', 0.28).attr('stroke-width', 1);
      prevPx = px;
      leftLines++;
    }
    // When the entire tail is narrower than one window-width (too compressed for even
    // one line), show a flat tint so it's still visually distinct from the linear region.
    if (leftLines === 0 && curR1 - r0 > 1) {
      leftG.append('rect')
        .attr('x', r0).attr('width', curR1 - r0)
        .attr('y', 0).attr('height', innerH)
        .attr('fill', tickColor).attr('fill-opacity', 0.10);
    }

    // Right tail — iterate inward from the boundary toward the extreme.
    prevPx = curR2;
    let rightLines = 0;
    for (let v = curXHi + windowSpan; v < rightMax; v += windowSpan) {
      const px = rightSub(v);
      if (px - prevPx < BAND_MIN_PX) {
        rightG.append('rect')
          .attr('x', prevPx).attr('width', Math.max(1, r3 - prevPx))
          .attr('y', 0).attr('height', innerH)
          .attr('fill', tickColor).attr('fill-opacity', 0.22);
        rightLines++;
        break;
      }
      rightG.append('line')
        .attr('x1', px).attr('y1', 0)
        .attr('x2', px + HATCH_DX).attr('y2', innerH)
        .attr('stroke', tickColor).attr('stroke-opacity', 0.28).attr('stroke-width', 1);
      prevPx = px;
      rightLines++;
    }
    if (rightLines === 0 && r3 - curR2 > 1) {
      rightG.append('rect')
        .attr('x', curR2).attr('width', r3 - curR2)
        .attr('y', 0).attr('height', innerH)
        .attr('fill', tickColor).attr('fill-opacity', 0.10);
    }
  }

  redrawHatch(leftScale, rightScale);

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

    let currentXLo = xLo, currentXHi = xHi;
    let currentR1  = r1,  currentR2  = r2;

    function applyState(newXLo, newXHi, newR1, newR2) {
      const s = buildScales(newXLo, newXHi, newR1, newR2);
      const ls = v => v <= newXLo ? s.leftScale(v) : v <= newXHi ? s.midScale(v) : s.rightScale(v);
      circles.attr('cx', d => ls(d.x));
      overlay.attr('x', newR1).attr('width', Math.max(0, newR2 - newR1));
      leftHandle?.attr('transform',  `translate(${newR1},0)`);
      rightHandle?.attr('transform', `translate(${newR2},0)`);
      redrawHatch(s.leftScale, s.rightScale);
      updateLeftAnnot(r0, newR1, xMin, newXLo);
      updateLinearAnnot(newR1, newR2, newXLo, newXHi);
      updateRightAnnot(newR2, r3, newXHi, xMax);
      onWindowDrag?.({ xLo: newXLo, xHi: newXHi });
      currentXLo = newXLo; currentXHi = newXHi;
      currentR1  = newR1;  currentR2  = newR2;
    }

    function applyLeftDrag(px) {
      // Full-range log scale — avoids exponential blowup when the left tail is
      // tiny (small r1). scaleLog([logMin,xLo],[0,r1]).invert exponentiation by
      // px/r1 is huge when r1 << px.
      const newXLo = scaleLog().domain([logMin, currentXHi]).range([r0, currentR2]).invert(px);
      applyState(newXLo, currentXHi, px, currentR2);
      return newXLo;
    }

    function applyRightDrag(px) {
      const newXHi = scaleLog().domain([currentXLo, xMax]).range([currentR1, r3]).invert(px);
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
        .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', tickColor).attr('stroke-width', 1).attr('stroke-opacity', 0.3)
        .style('pointer-events', 'none');

      const pillW = 8, pillH = 20;
      const pillY  = innerH / 2 - pillH / 2;
      const pill = handle.append('rect')
        .attr('x', -pillW / 2).attr('y', pillY)
        .attr('width', pillW).attr('height', pillH)
        .attr('rx', pillW / 2)
        .attr('fill', tickColor).attr('fill-opacity', 0.22);

      [-2, 2].forEach(cx =>
        [-5, 0, 5].forEach(dy =>
          handle.append('circle')
            .attr('cx', cx).attr('cy', innerH / 2 + dy)
            .attr('r', 1)
            .attr('fill', tickColor).attr('fill-opacity', 0.6)
        )
      );

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

    // Declare handles before pan drag so the pan closure can reference them.
    let leftHandle, rightHandle;

    // Pan: the box translates rigidly in pixel space. Domain values are derived
    // by a uniform linear rate (mid-scale units/pixel) so 1px of pan always equals
    // the same dollar step — no jump when the box crosses the initial boundaries.
    let panStartX = 0, panStartR1 = r1, panStartXLo = xLo, panStartXHi = xHi;

    overlay.call(drag()
      .on('start', event => {
        panStartX   = event.x;
        panStartR1  = currentR1;
        panStartXLo = currentXLo;
        panStartXHi = currentXHi;
        overlay.style('cursor', 'grabbing');
      })
      .on('drag', event => {
        const boxW    = currentR2 - currentR1;
        const panRate = (currentXHi - currentXLo) / boxW; // domain units per pixel
        const delta   = event.x - panStartX;
        const newR1   = Math.max(r0, Math.min(r3 - boxW, panStartR1 + delta));
        const newR2   = newR1 + boxW;
        const rawDelta = (newR1 - panStartR1) * panRate;
        let newXLo = panStartXLo + rawDelta;
        let newXHi = panStartXHi + rawDelta;
        if (newXLo < xMin) { newXHi -= (newXLo - xMin); newXLo = xMin; }
        if (newXHi > xMax) { newXLo -= (newXHi - xMax); newXHi = xMax; }
        applyState(newXLo, newXHi, newR1, newR2);
      })
      .on('end', () => {
        overlay.style('cursor', null);
        onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
    );

    leftHandle  = makeHandle(r1, 'left');
    rightHandle = makeHandle(r2, 'right');

    const kbStep = event => event.shiftKey ? innerW * 0.02 : 5;

    leftHandle.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const px = Math.max(r0, Math.min(currentR2 - MIN_WINDOW_PX, currentR1 + dir * kbStep(event)));
      applyLeftDrag(px);
      leftHandle.attr('aria-valuenow', currentXLo);
      onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
    });

    rightHandle.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const px = Math.max(currentR1 + MIN_WINDOW_PX, Math.min(r3, currentR2 + dir * kbStep(event)));
      applyRightDrag(px);
      rightHandle.attr('aria-valuenow', currentXHi);
      onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
    });

    overlay.on('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir   = event.key === 'ArrowRight' ? 1 : -1;
      const boxW  = currentR2 - currentR1;
      const step  = kbStep(event);
      const panRate = (currentXHi - currentXLo) / boxW;
      const newR1 = Math.max(r0, Math.min(r3 - boxW, currentR1 + dir * step));
      const newR2 = newR1 + boxW;
      const newXLo = Math.max(xMin, currentXLo + dir * step * panRate);
      const newXHi = Math.min(xMax, currentXHi + dir * step * panRate);
      applyState(newXLo, newXHi, newR1, newR2);
      onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
    });

    leftHandle.call(drag()
      .on('drag', event => {
        const px = Math.max(r0, Math.min(currentR2 - MIN_WINDOW_PX, event.x));
        applyLeftDrag(px);
      })
      .on('end', () => {
        onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
    );

    rightHandle.call(drag()
      .on('drag', event => {
        const px = Math.max(currentR1 + MIN_WINDOW_PX, Math.min(r3, event.x));
        applyRightDrag(px);
      })
      .on('end', () => {
        onWindowChange({ xLo: currentXLo, xHi: currentXHi, qLo: currentR1 / innerW, qHi: currentR2 / innerW });
      })
    );
  }

  return node;
}
