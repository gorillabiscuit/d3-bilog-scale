// linear-version branch only — generates static "before" figures for the article: the CryptoPunks
// 2024 data on a plain linear scale and on a plain log scale, showing why each standard scale fails.
// Renders them through the REAL chart renderer (createChart) so the figures can never drift from the
// live chart and the embed page (static.js). createChart is DOM-based (d3-selection / d3-axis), so we
// hand Node a lightweight in-memory document (linkedom) before importing it. Writes SVGs straight
// into the website's public/images/adaptive-scale/.
//
//   node generate-figures.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseHTML } from 'linkedom';

// createChart calls d3-selection's create() / axisBottom(), which read the global `document`. Install
// a fake one BEFORE importing any DOM-touching module — static imports hoist above this line and
// would run with no document — then dynamic-import the rest.
const { document, window } = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
globalThis.document = document;
globalThis.window = window;

const { csvParse }              = await import('d3-dsv');
const { extent }                = await import('d3-array');
const { scaleLinear, scaleLog } = await import('d3-scale');
const { axisBottom }            = await import('d3-axis');
const { select }                = await import('d3-selection');
const { createChart, MARGIN }   = await import('./src/chart/base-chart.js');
const { cleanLogTicks }         = await import('./src/utils/ticks.js');
const { makeFmt }               = await import('./src/utils/format.js');

const SVG_NS = 'http://www.w3.org/2000/svg';
const DATA = new URL('./public/data/nft-lending-cryptopunks-2024.csv', import.meta.url);
const OUT_DIR = '/Users/wouterschreuders/Code/wouter-s-digital-studio/public/images/adaptive-scale';

// Dark palette inlined on the root so the var() references in CHART_CSS resolve when the SVG opens
// standalone (outside the app page that normally defines the theme tokens).
const THEME = {
  '--dot-fill': '#7070ff', '--axis-color': '#3a3a6a', '--axis-text': '#a0a0c0',
  '--label-color': '#6060a0', '--ruler-tint': '#ffffff', '--chart-surface': '#16213e',
};

const W = 1000, H = 480;
const innerW = W - MARGIN.left - MARGIN.right;

const rows = csvParse(readFileSync(DATA, 'utf8'));
const points = rows
  .map((r) => ({ x: +r.principal_usd, y: +r.apr_pct }))
  .filter((p) => p.x > 0 && p.y >= 1 && Number.isFinite(p.x) && Number.isFinite(p.y));

// Render one figure through the live chart renderer, then make it a self-contained file: tidy the
// log axis (createChart's generic .ticks(6) over-densifies a log scale — same fix static.js applies),
// inline the theme tokens, and give it an opaque background (the on-page SVG is transparent).
function figureSvg(xScale, isLog, xLabel, yLabel) {
  const el = createChart(points, xScale, {
    width: W, height: H, xLabel, yLabel,
    xFormat: 'currency', yFormat: '.1f',
    jitter: null, // static export — dots at true positions, no force sim / animation
  });
  if (isLog) {
    select(el).select('.x-axis')
      .call(axisBottom(xScale).tickValues(cleanLogTicks(xScale)).tickFormat(makeFmt('currency')));
  }
  for (const [k, v] of Object.entries(THEME)) el.style.setProperty(k, v);
  // Fixed pixel size for a standalone file (the on-page chart is sized to 100% of its container).
  el.style.removeProperty('width');
  el.style.removeProperty('height');
  el.setAttribute('width', W);
  el.setAttribute('height', H);
  el.setAttribute('xmlns', SVG_NS);
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width', W); bg.setAttribute('height', H);
  bg.setAttribute('fill', THEME['--chart-surface']);
  el.insertBefore(bg, el.firstChild);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + el.outerHTML;
}

const linearX = scaleLinear().domain([0, extent(points, (d) => d.x)[1]]).nice().range([0, innerW]);
const logX = scaleLog().domain(extent(points, (d) => d.x)).range([0, innerW]);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/linear.svg`, figureSvg(linearX, false, 'Loan principal (USD)', 'APR (%)'));
writeFileSync(`${OUT_DIR}/log.svg`, figureSvg(logX, true, 'Loan principal (USD)', 'APR (%)'));
console.log(`Wrote linear.svg and log.svg (${points.length} points) to ${OUT_DIR}`);
