import { create, pointer, select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { extent, bisectLeft } from 'd3-array';
import { makeFmt } from '../utils/format.js';

export const MARGIN = { top: 32, right: 24, bottom: 48, left: 56 };

// Incrementing counter for unique clip-path ids across chart instances.
// Observable renders many cells simultaneously — a shared id silently breaks clipping.
let _clipId = 0;

// Stylesheet injected into every chart SVG. The division of labour is strict: JS owns geometry
// and data-driven opacity (dot density, ruler tint ramp); CSS owns every colour, via custom
// properties. Fallbacks match the dark theme, so a chart pasted into an Observable cell renders
// standalone — define the --tokens (see index.html) to theme it, e.g. by toggling data-theme.
export const CHART_CSS = `
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
.chart .annot-value { paint-order: stroke fill; stroke: var(--chart-surface, #16213e); stroke-width: 3px; }
`;

/**
 * Create a scatterplot SVG node.
 *
 * Returns svg.node() — caller is responsible for inserting it into the DOM.
 * This matches the Observable cell pattern: `chart = createChart(data, scale, {width})`.
 *
 * @param {Array<{x, y}>} points
 * @param {Function} xScale  D3-compatible scale, already ranged to [0, innerWidth]
 * @param {Object}   options
 * @returns {SVGElement}
 */
export function createChart(points, xScale, {
  width        = 900,
  height       = 260,
  xLabel       = 'x',
  yLabel       = 'y',
  xFormat      = '~s',
  yFormat      = '~s',
  clipPadding,             // extra px around the plot area before clipping; defaults to dot radius
  rankNoun     = 'points', // plural noun for the tooltip's percentile line ("… of companies")
  dotRadius,               // undefined → auto-size by point count
  dotOpacity,              // undefined → auto-size by density
} = {}) {
  const { top: mTop, right: mRight, bottom: mBot, left: mLeft } = MARGIN;
  const innerW = width  - mLeft - mRight;
  const innerH = height - mTop  - mBot;
  const clipId = `clip-${++_clipId}`;
  const r   = dotRadius  ?? (points.length > 500 ? 2 : 3);
  const pad = clipPadding ?? r;

  const autoOpacity = dotOpacity ?? (points.length > 500 ? 0.35 : points.length > 100 ? 0.55 : 0.8);

  const [yMin, yMax] = extent(points, d => d.y);
  const yRange = yMax - yMin;
  const yPad = yRange * 0.05 || Math.abs(yMin) * 0.05 || 1;
  const yScale = scaleLinear()
    .domain([yMin - yPad, yMax + yPad]).nice()
    .range([innerH, 0]);

  const xFmt = makeFmt(xFormat);
  const yFmt = makeFmt(yFormat);

  const svg = create('svg')
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
    .attr('transform', `translate(${mLeft},${mTop})`);

  // ── x-axis ───────────────────────────────────────────────────────────────
  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(xScale).ticks(6).tickFormat(xFmt));

  // ── y-axis ───────────────────────────────────────────────────────────────
  g.append('g')
    .attr('class', 'y-axis')
    .call(axisLeft(yScale).ticks(5).tickFormat(yFmt));

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
    const pct = Math.round((bisectLeft(xSorted, x) / Math.max(1, n)) * 100);
    return pct >= 50
      ? `bigger than ${Math.min(pct, 99)}% of ${rankNoun}`
      : `smaller than ${Math.min(100 - pct, 99)}% of ${rankNoun}`;
  };
  const truncate = (s, max) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);
  const TT_LINE_H = 16, TT_PAD_X = 8;

  // ── Dots ─────────────────────────────────────────────────────────────────
  g.append('g')
    .attr('clip-path', `url(#${clipId})`)
    .selectAll('circle')
    .data(points)
    .join('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', r)
      .attr('fill-opacity', autoOpacity)
    .on('pointerenter', function(event, d) {
      select(this).raise()
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
      const [px, py] = pointer(event, g.node());
      positionTooltip(px, py, ttW, ttH);
    })
    .on('pointermove', function(event) {
      const ttW = +tt.select('.tt-bg').attr('width') || 160;
      const ttH = +tt.select('.tt-bg').attr('height') || 46;
      const [px, py] = pointer(event, g.node());
      positionTooltip(px, py, ttW, ttH);
    })
    .on('pointerleave', function() {
      select(this)
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

  return svg.node();
}
