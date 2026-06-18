import { create, pointer, select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { extent } from 'd3-array';
import { format } from 'd3-format';

export const MARGIN = { top: 32, right: 24, bottom: 48, left: 56 };

// Incrementing counter for unique clip-path ids across chart instances.
// Observable renders many cells simultaneously — a shared id silently breaks clipping.
let _clipId = 0;

// d3.format uses SI prefixes: k, M, G (billion), T. Financial convention uses B for
// billion, so currency values get their own formatter rather than "$~s" from d3-format.
function currencyFmt(v) {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${+(v / 1e12).toPrecision(3)}T`;
  if (abs >= 1e9)  return `$${+(v / 1e9).toPrecision(3)}B`;
  if (abs >= 1e6)  return `$${+(v / 1e6).toPrecision(3)}M`;
  if (abs >= 1e3)  return `$${+(v / 1e3).toPrecision(3)}k`;
  return `$${+v.toPrecision(3)}`;
}

function makeFmt(specifier) {
  return specifier === 'currency' ? currencyFmt : format(specifier);
}

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
  width   = 900,
  height  = 260,
  xLabel  = 'x',
  yLabel  = 'y',
  xFormat = '~s',
  yFormat = '~s',
} = {}) {
  const { top: mTop, right: mRight, bottom: mBot, left: mLeft } = MARGIN;
  const innerW = width  - mLeft - mRight;
  const innerH = height - mTop  - mBot;
  const clipId = `clip-${++_clipId}`;

  const [yMin, yMax] = extent(points, d => d.y);
  const yRange = yMax - yMin;
  const yPad = yRange * 0.05 || Math.abs(yMin) * 0.05 || 1;
  const yScale = scaleLinear()
    .domain([yMin - yPad, yMax + yPad]).nice()
    .range([innerH, 0]);

  const xFmt = makeFmt(xFormat);
  const yFmt = makeFmt(yFormat);

  const svg = create('svg')
    .attr('viewBox', [0, 0, width, height])
    .style('max-width', '100%')
    .style('height', 'auto')
    .style('overflow', 'visible')
    .style('font', '10px sans-serif');

  svg.append('defs')
    .append('clipPath')
    .attr('id', clipId)
    .append('rect')
    .attr('width', innerW)
    .attr('height', innerH);

  const g = svg.append('g')
    .attr('transform', `translate(${mLeft},${mTop})`);

  // ── x-axis ───────────────────────────────────────────────────────────────
  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(xScale).ticks(6).tickFormat(xFmt))
    .call(a => a.select('.domain').attr('stroke', '#3a3a6a'))
    .call(a => a.selectAll('.tick line').attr('stroke', '#3a3a6a'))
    .call(a => a.selectAll('.tick text').attr('fill', '#a0a0c0').attr('font-size', '10px'));

  // ── y-axis ───────────────────────────────────────────────────────────────
  g.append('g')
    .attr('class', 'y-axis')
    .call(axisLeft(yScale).ticks(5).tickFormat(yFmt))
    .call(a => a.select('.domain').attr('stroke', '#3a3a6a'))
    .call(a => a.selectAll('.tick line').attr('stroke', '#3a3a6a'))
    .call(a => a.selectAll('.tick text').attr('fill', '#a0a0c0').attr('font-size', '10px'));

  // ── SVG-internal tooltip ─────────────────────────────────────────────────
  const tt = g.append('g')
    .attr('class', 'tooltip')
    .attr('pointer-events', 'none')
    .style('display', 'none');

  tt.append('rect')
    .attr('class', 'tt-bg')
    .attr('rx', 4)
    .attr('fill', '#0d1a33')
    .attr('stroke', '#3a3a6a')
    .attr('stroke-width', 1);

  tt.append('text').attr('class', 'tt-line1')
    .attr('fill', '#e0e0f0').attr('font-size', '11px')
    .attr('x', 8).attr('y', 17);

  tt.append('text').attr('class', 'tt-line2')
    .attr('fill', '#a0a0c0').attr('font-size', '11px')
    .attr('x', 8).attr('y', 33);

  // ── Dots ─────────────────────────────────────────────────────────────────
  const dotOpacity = points.length > 500 ? 0.35 : points.length > 100 ? 0.55 : 0.8;
  const r = points.length > 500 ? 2 : 3;

  g.append('g')
    .attr('clip-path', `url(#${clipId})`)
    .selectAll('circle')
    .data(points)
    .join('circle')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', r)
      .attr('fill', '#7070ff')
      .attr('fill-opacity', dotOpacity)
    .on('pointerenter', function(event, d) {
      select(this).raise()
        .attr('r', r + 2)
        .attr('fill', '#b0b0ff')
        .attr('fill-opacity', 1);

      const line1 = `${xLabel}: ${xFmt(d.x)}`;
      const line2 = `${yLabel}: ${yFmt(d.y)}`;
      tt.select('.tt-line1').text(line1);
      tt.select('.tt-line2').text(line2);

      const ttW = Math.max(line1.length, line2.length) * 6.5 + 16;
      tt.select('.tt-bg').attr('width', ttW).attr('height', 46);

      tt.raise().style('display', null);
      const [px, py] = pointer(event, g.node());
      positionTooltip(px, py, ttW, 46);
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
        .attr('fill', '#7070ff')
        .attr('fill-opacity', dotOpacity);
      tt.style('display', 'none');
    });

  function positionTooltip(px, py, ttW, ttH) {
    const tx = px + ttW + 12 > innerW ? px - ttW - 8 : px + 12;
    const ty = py - ttH - 8 < 0      ? py + 8        : py - ttH - 8;
    tt.attr('transform', `translate(${tx},${ty})`);
  }

  // ── Axis labels ──────────────────────────────────────────────────────────
  g.append('text')
    .attr('x', innerW / 2).attr('y', innerH + 44)
    .attr('text-anchor', 'middle')
    .attr('fill', '#6060a0').attr('font-size', '11px')
    .text(xLabel);

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerH / 2).attr('y', -44)
    .attr('text-anchor', 'middle')
    .attr('fill', '#6060a0').attr('font-size', '11px')
    .text(yLabel);

  return svg.node();
}
