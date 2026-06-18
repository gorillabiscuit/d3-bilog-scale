import { select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { min, max } from 'd3-array';

const MARGIN = { top: 16, right: 24, bottom: 48, left: 56 };

/**
 * Render a scatterplot into container using the provided xScale.
 * The xScale must already have domain and range set.
 * points: [{x, y}], xLabel/yLabel: strings, title: string
 */
export function renderChart(container, points, xScale, { xLabel = 'x', yLabel = 'y', title = '', regionMarkers = [] } = {}) {
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 260;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  // Clear previous render
  select(container).selectAll('*').remove();

  const svg = select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg.append('g')
    .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

  // Y scale — linear, shared
  const yMin = min(points, (d) => d.y);
  const yMax = max(points, (d) => d.y);
  const yPad = (yMax - yMin) * 0.05 || 1;
  const yScale = scaleLinear()
    .domain([yMin - yPad, yMax + yPad])
    .range([innerH, 0])
    .nice();

  // Region background shading (adaptive chart only)
  for (const region of regionMarkers) {
    if (region.type === 'log') {
      const x1 = xScale(region.domain[0]) - MARGIN.left;
      const x2 = xScale(region.domain[1]) - MARGIN.left;
      g.append('rect')
        .attr('x', x1)
        .attr('width', Math.max(0, x2 - x1))
        .attr('y', 0)
        .attr('height', innerH)
        .attr('fill', '#2a1a3e')
        .attr('opacity', 0.5);
    }
  }

  // X axis
  const xAxis = axisBottom(xScale)
    .tickFormat(xScale.tickFormat ? xScale.tickFormat() : null)
    .ticks(8);

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(xAxis)
    .call((axis) => {
      axis.selectAll('text')
        .attr('fill', '#a0a0c0')
        .attr('font-size', '10px')
        .attr('dy', '1em');
      axis.selectAll('line,path').attr('stroke', '#3a3a6a');
    });

  // Y axis
  g.append('g')
    .call(axisLeft(yScale).ticks(5))
    .call((axis) => {
      axis.selectAll('text').attr('fill', '#a0a0c0').attr('font-size', '10px');
      axis.selectAll('line,path').attr('stroke', '#3a3a6a');
    });

  // Region boundary lines
  for (const region of regionMarkers) {
    for (const bv of region.domain) {
      if (bv === min(points, d => d.x) || bv === max(points, d => d.x)) continue;
      const px = xScale(bv) - MARGIN.left;
      g.append('line')
        .attr('x1', px).attr('x2', px)
        .attr('y1', 0).attr('y2', innerH)
        .attr('stroke', '#6060a0')
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.6);
    }
  }

  // Dots
  const dotOpacity = points.length > 500 ? 0.35 : points.length > 100 ? 0.55 : 0.8;
  const dotRadius = points.length > 500 ? 2 : 3;

  g.selectAll('circle')
    .data(points)
    .join('circle')
    .attr('cx', (d) => xScale(d.x) - MARGIN.left)
    .attr('cy', (d) => yScale(d.y))
    .attr('r', dotRadius)
    .attr('fill', '#7070ff')
    .attr('opacity', dotOpacity);

  // X axis label
  g.append('text')
    .attr('x', innerW / 2)
    .attr('y', innerH + 40)
    .attr('text-anchor', 'middle')
    .attr('fill', '#6060a0')
    .attr('font-size', '11px')
    .text(xLabel);

  // Y axis label
  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerH / 2)
    .attr('y', -44)
    .attr('text-anchor', 'middle')
    .attr('fill', '#6060a0')
    .attr('font-size', '11px')
    .text(yLabel);
}
