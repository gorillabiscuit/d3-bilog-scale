import { create, pointer, select } from 'd3-selection';
import 'd3-transition';  // patches Selection.prototype with .transition()
import { easeBackOut, easeCubicInOut } from 'd3-ease';
import { scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { extent, bisectLeft } from 'd3-array';
import { forceSimulation, forceCollide, forceY } from 'd3-force';
import { makeFmt, tickCountForWidth } from '../utils/format.js';

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
 * Data of any shape is accepted via the x/y/label/meta accessor options
 * (defaults assume {x, y, label, meta} objects).
 *
 * @param {Array}    data     one datum per dot, any shape the accessors understand
 * @param {Function} xScale   D3-compatible scale, already ranged to [0, innerWidth]
 * @param {Object}   options
 * @returns {SVGElement}
 */
export function createChart(data, xScale, {
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
  yType        = scaleLinear,  // d3 scale constructor for the y axis
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

  const [yMin, yMax] = extent(points, d => d.y);
  const yRange = yMax - yMin;
  const yPad = yRange * 0.05 || Math.abs(yMin) * 0.05 || 1;
  const yScale = yType()
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
    .attr('transform', `translate(${marginLeft},${marginTop})`);

  // ── x-axis ───────────────────────────────────────────────────────────────
  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(axisBottom(xScale).ticks(tickCountForWidth(innerW)).tickFormat(xFmt));

  // ── y-axis ───────────────────────────────────────────────────────────────
  g.append('g')
    .attr('class', 'y-axis')
    .call(axisLeft(yScale).ticks(yTicks).tickFormat(yFmt));

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

    forceSimulation(jNodes)
      .force('collide', forceCollide(r + 1).strength(0.8))
      .force('y', forceY(d => d.cy0).strength(
        // Isolated dots get a strong restoring force (barely move).
        // Dense dots get a weak one so they can spread far enough to be visible.
        d => Math.max(0.05, 0.35 - (d.density / maxDensity) * 0.30)
      ))
      .force('wall', wallForce)
      // Seeded runs start cool: at full alpha the restoring forceY collapses the seeded
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

  // Expose in-place spread toggle — callers animate without rebuilding the SVG.
  const svgNode = svg.node();

  // Settled spread offsets (y − cy0, by index) — feed back as spreadSeed on the next render of
  // the SAME dataset so the new simulation refines this arrangement instead of re-rolling it.
  svgNode.spreadOffsets = spread !== null ? jNodes.map(n => n.y - n.cy0) : null;
  svgNode.setSpread = (enabled, duration = 500) => {
    circles.transition()
      .duration(duration)
      .ease(enabled ? easeBackOut.overshoot(1.4) : easeCubicInOut)
      .attr('cy', (_, i) => enabled ? jNodes[i].y : jNodes[i].cy0);
  };

  // Animate the spread from a set of incoming cy values to this render's settled spread. A pan or
  // handle release rebuilds the SVG with freshly-computed spread positions; the caller passes the
  // dots' previous cy (by index — same dataset, same order) so each dot eases from where it was to
  // where it now belongs instead of snapping. cy is set synchronously first (before paint) so there
  // is no one-frame flash at the new positions. easeCubicInOut keeps it quick and smooth (no bounce).
  svgNode.springSpreadFrom = (fromCy, duration = 320) => {
    if (spread === null || !fromCy) return;
    // Set the incoming positions synchronously (before paint, so there's no flash at the new
    // spread), then start the transition on the next frame. A transition created in the same
    // synchronous block as the freshly-inserted element jumps straight to its end; deferring one
    // frame — the same way the entrance animation does — lets it actually animate.
    circles.interrupt().attr('cy', (_, i) => fromCy[i] != null ? fromCy[i] : jNodes[i].y);
    requestAnimationFrame(() => {
      circles.transition().duration(duration).ease(easeCubicInOut).attr('cy', (_, i) => jNodes[i].y);
    });
  };
  return svgNode;
}
