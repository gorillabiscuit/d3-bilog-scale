// linear-version branch only — generates static "before" figures for the article:
// the CryptoPunks 2024 data on a plain linear scale and on a plain log scale, showing why each
// standard scale fails. Dependency-free (reuses d3-scale/d3-array/d3-dsv, already deps, which run
// in Node), and reuses the chart's own MARGIN + CHART_CSS so the figures match the real chart's
// look. Writes SVGs straight into the website's public/images/adaptive-scale/.
//
//   node generate-figures.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { csvParse } from 'd3-dsv';
import { extent } from 'd3-array';
import { scaleLinear, scaleLog } from 'd3-scale';
import { MARGIN, CHART_CSS } from './src/chart/base-chart.js';
import { makeFmt } from './src/utils/format.js';

const DATA = new URL('./public/data/nft-lending-cryptopunks-2024.csv', import.meta.url);
const OUT_DIR = '/Users/wouterschreuders/Code/wouter-s-digital-studio/public/images/adaptive-scale';

// Dark palette (matches the website's default theme and the chart's identity). Inlined on the
// root so the var() references in CHART_CSS resolve when the SVG is opened standalone.
const THEME = {
  '--dot-fill': '#7070ff', '--axis-color': '#3a3a6a', '--axis-text': '#a0a0c0',
  '--label-color': '#6060a0', '--ruler-tint': '#ffffff', '--chart-surface': '#16213e',
};

const W = 1000, H = 480;
const innerW = W - MARGIN.left - MARGIN.right;
const innerH = H - MARGIN.top - MARGIN.bottom;

const rows = csvParse(readFileSync(DATA, 'utf8'));
const points = rows
  .map((r) => ({ x: +r.principal_usd, y: +r.apr_pct }))
  .filter((p) => p.x > 0 && p.y >= 1 && Number.isFinite(p.x) && Number.isFinite(p.y));

const [yMin, yMax] = extent(points, (d) => d.y);
const yPad = (yMax - yMin) * 0.05 || 1;
const yScale = scaleLinear().domain([yMin - yPad, yMax + yPad]).nice().range([innerH, 0]);

const xFmt = makeFmt('currency');
const yFmt = makeFmt('.1f');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Cull x ticks so labels don't collide (keep ≥ 70px apart). For log, restrict to the
// conventional 1/2/5 mantissas so the axis reads as clean decade-ish marks.
function xTicks(scale, count, isLog) {
  let ticks = scale.ticks(count);
  if (isLog) {
    ticks = ticks.filter((t) => {
      const m = t / Math.pow(10, Math.floor(Math.log10(t) + 1e-9));
      return [1, 2, 5].some((k) => Math.abs(m - k) < 1e-6);
    });
  }
  const kept = [];
  let lastPx = -Infinity;
  for (const t of ticks) {
    const px = scale(t);
    if (px - lastPx >= 70) { kept.push(t); lastPx = px; }
  }
  return kept;
}

function figure(xScale, count, isLog, xLabel, yLabel) {
  const dots = points
    .map((d) => `<circle class="dot" cx="${xScale(d.x).toFixed(1)}" cy="${yScale(d.y).toFixed(1)}" r="2"/>`)
    .join('');
  const xt = xTicks(xScale, count, isLog)
    .map((t) => `<g class="tick" transform="translate(${xScale(t).toFixed(1)},0)"><line y2="6"/><text y="9" dy="0.71em" text-anchor="middle">${esc(xFmt(t))}</text></g>`)
    .join('');
  const yt = yScale.ticks(5)
    .map((t) => `<g class="tick" transform="translate(0,${yScale(t).toFixed(1)})"><line x2="-6"/><text x="-9" dy="0.32em" text-anchor="end">${esc(yFmt(t))}</text></g>`)
    .join('');
  const rootStyle = Object.entries(THEME).map(([k, v]) => `${k}:${v}`).join(';');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="chart" style="${rootStyle};font:10px sans-serif">
<style>${CHART_CSS}
.chart .dot { fill-opacity: 0.35; }
.chart .axis-label { font-size: 11px; }
</style>
<rect x="0" y="0" width="${W}" height="${H}" fill="var(--chart-surface)"/>
<g transform="translate(${MARGIN.left},${MARGIN.top})">
<g class="x-axis" transform="translate(0,${innerH})"><path class="domain" d="M0,0H${innerW}"/>${xt}</g>
<g class="y-axis"><path class="domain" d="M0,0V${innerH}"/>${yt}</g>
<text class="axis-label" x="${innerW / 2}" y="${innerH + 38}" text-anchor="middle">${esc(xLabel)}</text>
<text class="axis-label" transform="translate(-42,${innerH / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>
${dots}
</g>
</svg>`;
}

const linearX = scaleLinear().domain([0, extent(points, (d) => d.x)[1]]).nice().range([0, innerW]);
const logX = scaleLog().domain(extent(points, (d) => d.x)).range([0, innerW]);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/linear.svg`, figure(linearX, 6, false, 'Loan principal (USD)', 'APR (%)'));
writeFileSync(`${OUT_DIR}/log.svg`, figure(logX, 12, true, 'Loan principal (USD)', 'APR (%)'));
console.log(`Wrote linear.svg and log.svg (${points.length} points) to ${OUT_DIR}`);
