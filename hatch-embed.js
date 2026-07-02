import { csvParse } from 'd3-dsv';
import { createAdaptiveChart } from './src/chart/adaptive-chart.js';
import { registerSvgSaveShortcut } from './src/save-svg.js';

const THEMES = {
  dark: {
    dotColor:        '#7070ff',
    axisColor:       '#3a3a6a',
    axisTextColor:   '#a0a0c0',
    labelColor:      '#6060a0',
    tooltipBg:       '#0d1a33',
    tooltipBorder:   '#3a3a6a',
    tooltipTextColor:'#e0e0f0',
    tooltipTextMuted:'#a0a0c0',
    overlayColor:    'white',
    tickColor:       'white',
    chartBg:         '#16213e',
  },
  light: {
    dotColor:        '#4040cc',
    axisColor:       '#c0c0d8',
    axisTextColor:   '#5050a0',
    labelColor:      '#8080b0',
    tooltipBg:       '#f0f0ff',
    tooltipBorder:   '#c0c0d8',
    tooltipTextColor:'#1a1a2e',
    tooltipTextMuted:'#5050a0',
    overlayColor:    '#4040cc',
    tickColor:       '#4040cc',
    chartBg:         '#ffffff',
  },
};

// Read ?theme= URL param; fall back to dark.
const urlTheme = new URLSearchParams(window.location.search).get('theme');
const themeName = urlTheme === 'light' ? 'light' : 'dark';
document.documentElement.setAttribute('data-theme', themeName);

let points = [];
let manualXLo = null, manualXHi = null;
let manualQLo = null, manualQHi = null;
let chartNode = null;

async function init() {
  const res  = await fetch(import.meta.env.BASE_URL + 'data/nyc-sample.csv');
  const text = await res.text();
  points = csvParse(text)
    .map((r) => ({ x: +r.x, y: +r.y, label: r.label, meta: r.meta }))
    .filter((p) => p.x >= 1 && Number.isFinite(p.x) && Number.isFinite(p.y));
  render();
}

function render() {
  const container = document.getElementById('chart-adaptive');
  const el = createAdaptiveChart(points, {
    width: container.clientWidth,
    height: container.clientHeight,
    mode: 'piecewise',
    windowFraction: 0.5,
    xLo: manualXLo ?? undefined,
    xHi: manualXHi ?? undefined,
    qLo: manualQLo ?? undefined,
    qHi: manualQHi ?? undefined,
    onWindowDrag: () => {},
    onWindowChange: ({ xLo, xHi, qLo, qHi }) => {
      manualXLo = xLo; manualXHi = xHi;
      if (qLo != null) manualQLo = qLo;
      if (qHi != null) manualQHi = qHi;
      render();
    },
    xLabel: 'Sale price (USD)',
    yLabel: 'Price per sq ft (USD)',
    xFormat: 'currency',
    yFormat: 'currency',
    spread: null, // dots at true positions — the embed has no spread toggle
    // Chart colours come from the CSS custom properties in CHART_CSS (dark fallbacks built in);
    // THEMES below only feeds the press-S SVG export background.
  });
  container.replaceChildren(el);
  chartNode = el;
}

let _resizeTimer;
const ro = new ResizeObserver(() => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(render, 120);
});
ro.observe(document.getElementById('chart-adaptive'));

registerSvgSaveShortcut(
  () => chartNode,
  () => 'hatch-nyc',
  () => THEMES[themeName].chartBg,
);

init();
