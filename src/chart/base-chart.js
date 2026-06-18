import { select, pointer } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { min, max } from 'd3-array';

// Shared floating tooltip — one instance for the whole page
let _tooltip = null;
function getTooltip() {
  if (!_tooltip) {
    _tooltip = select('body').append('div')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background', '#0d1a33')
      .style('border', '1px solid #3a3a6a')
      .style('border-radius', '4px')
      .style('padding', '6px 10px')
      .style('font-size', '11px')
      .style('color', '#e0e0f0')
      .style('line-height', '1.6')
      .style('opacity', '0')
      .style('transition', 'opacity 0.1s')
      .style('z-index', '100');
  }
  return _tooltip;
}

export const MARGIN = { top: 32, right: 24, bottom: 48, left: 56 };

function fmt(v) {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${+( v / 1e12).toPrecision(3)}T`;
  if (abs >= 1e9)  return `$${+(v / 1e9).toPrecision(3)}B`;
  if (abs >= 1e6)  return `$${+(v / 1e6).toPrecision(3)}M`;
  if (abs >= 1e3)  return `$${+(v / 1e3).toPrecision(3)}k`;
  return `$${+v.toPrecision(3)}`;
}

const REGION_COLORS = {
  log:    { fill: '#2a1040', label: '#9060c0' },
  linear: { fill: '#0d1a33', label: '#4060a0' },
};

const REGION_LABELS = {
  left_log:    'left tail (log)',
  linear:      'dense cluster (linear)',
  right_log:   'right tail (log)',
};

/**
 * Render a scatterplot into container using xScale.
 * xScale must have range [0, innerW].
 * options.regions — array from scaleAdaptive().regions(), used only for the adaptive chart.
 */
export function renderChart(container, points, xScale, { xLabel = 'x', yLabel = 'y', regions = [] } = {}) {
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 260;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  select(container).selectAll('*').remove();

  const svg = select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  // Clip path keeps dots inside plot area
  svg.append('defs').append('clipPath')
    .attr('id', `clip-${container.id}`)
    .append('rect')
    .attr('width', innerW)
    .attr('height', innerH);

  const g = svg.append('g')
    .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

  // ── Region bands (adaptive chart only) ──────────────────────────────────
  if (regions.length > 0) {
    const logRegions = regions.filter((r) => r.type === 'log');
    const isLeftLog  = logRegions.length > 0 && logRegions[0].range[0] < innerW * 0.5;
    const isRightLog = logRegions.length > 0 && logRegions[logRegions.length - 1].range[1] > innerW * 0.5;

    regions.forEach((region, i) => {
      const x1 = region.range[0];
      const x2 = region.range[1];
      const w  = Math.max(0, x2 - x1);
      const color = REGION_COLORS[region.type];

      // Background band
      g.append('rect')
        .attr('x', x1).attr('width', w)
        .attr('y', 0).attr('height', innerH)
        .attr('fill', color.fill);

      // Section label at top of band
      let labelKey;
      if (region.type === 'log') {
        labelKey = (i === 0 && isLeftLog) ? 'left_log' : 'right_log';
      } else {
        labelKey = 'linear';
      }

      g.append('text')
        .attr('x', x1 + w / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .attr('fill', color.label)
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .attr('letter-spacing', '0.05em')
        .text(REGION_LABELS[labelKey]);
    });

    // Boundary lines between regions
    for (let i = 0; i < regions.length - 1; i++) {
      const bx = regions[i].range[1];
      g.append('line')
        .attr('x1', bx).attr('x2', bx)
        .attr('y1', -MARGIN.top).attr('y2', innerH)
        .attr('stroke', '#6040a0')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,3');
    }
  }

  // ── Y scale ─────────────────────────────────────────────────────────────
  const yMin = min(points, (d) => d.y);
  const yMax = max(points, (d) => d.y);
  const yPad = (yMax - yMin) * 0.05 || 1;
  const yScale = scaleLinear()
    .domain([yMin - yPad, yMax + yPad])
    .range([innerH, 0])
    .nice();

  // ── Axes ─────────────────────────────────────────────────────────────────
  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(
      axisBottom(xScale)
        .ticks(6)
        .tickFormat(xScale.breakpointMethod ? xScale.tickFormat() : fmt)
    )
    .call((a) => {
      a.selectAll('text')
        .attr('fill', '#a0a0c0')
        .attr('font-size', '10px');
      a.selectAll('line,path').attr('stroke', '#3a3a6a');
    });

  g.append('g')
    .call(axisLeft(yScale).ticks(5))
    .call((a) => {
      a.selectAll('text').attr('fill', '#a0a0c0').attr('font-size', '10px');
      a.selectAll('line,path').attr('stroke', '#3a3a6a');
    });

  // ── Dots ─────────────────────────────────────────────────────────────────
  const dotOpacity = points.length > 500 ? 0.35 : points.length > 100 ? 0.55 : 0.8;
  const dotRadius  = points.length > 500 ? 2 : 3;
  const tt = getTooltip();

  g.append('g')
    .attr('clip-path', `url(#clip-${container.id})`)
    .selectAll('circle')
    .data(points)
    .join('circle')
    .attr('cx', (d) => xScale(d.x))
    .attr('cy', (d) => yScale(d.y))
    .attr('r', dotRadius)
    .attr('fill', '#7070ff')
    .attr('opacity', dotOpacity)
    .on('mouseover', function (event, d) {
      select(this).attr('r', dotRadius + 2).attr('fill', '#b0b0ff').attr('opacity', 1);
      tt.html(`<b>${xLabel}</b>: ${fmt(d.x)}<br><b>${yLabel}</b>: ${fmt(d.y)}`)
        .style('opacity', '1');
    })
    .on('mousemove', function (event) {
      const ttNode = tt.node();
      const ttW = ttNode.offsetWidth;
      const ttH = ttNode.offsetHeight;
      const x = event.clientX + ttW + 16 > window.innerWidth
        ? event.clientX - ttW - 8
        : event.clientX + 12;
      const y = event.clientY - 28 < 0
        ? event.clientY + 8
        : event.clientY - ttH - 4;
      tt.style('left', x + 'px').style('top', y + 'px');
    })
    .on('mouseout', function () {
      select(this).attr('r', dotRadius).attr('fill', '#7070ff').attr('opacity', dotOpacity);
      tt.style('opacity', '0');
    });

  // ── Axis labels ──────────────────────────────────────────────────────────
  g.append('text')
    .attr('x', innerW / 2)
    .attr('y', innerH + 44)
    .attr('text-anchor', 'middle')
    .attr('fill', '#6060a0')
    .attr('font-size', '11px')
    .text(xLabel);

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerH / 2)
    .attr('y', -44)
    .attr('text-anchor', 'middle')
    .attr('fill', '#6060a0')
    .attr('font-size', '11px')
    .text(yLabel);
}
