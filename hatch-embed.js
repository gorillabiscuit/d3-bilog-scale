import { csvParse } from 'd3-dsv';
import { createAdaptiveChart } from './src/chart/adaptive-chart.js';
import { windowQuantile } from './src/scale/window.js';
import { registerSvgSaveShortcut } from './src/save-svg.js';

const THEME = {
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
};

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
    window: 0.5,
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
    tailTicks: 6,
    showLocalRate: true,
    ...THEME,
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
  () => THEME.chartBg,
);

init();
