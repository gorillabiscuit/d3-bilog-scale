// Embed-only entry (linear-version branch) — renders the chart on a plain linear or log scale,
// chosen by ?mode=linear|log. Reuses the base chart renderer (dots, axes, tooltips, spread); it
// deliberately omits the adaptive window controls, which don't apply to a single fixed scale.
// Used by the website article to show why each standard scale fails, as real interactive charts.

import { extent } from 'd3-array';
import { scaleLinear, scaleLog } from 'd3-scale';
import { axisBottom } from 'd3-axis';
import { select } from 'd3-selection';
import { createChart, MARGIN } from './chart/base-chart.js';
import { makeFmt } from './utils/format.js';
import { loadCryptoPunks2024 } from './data/loaders.js';

// A log axis from d3 dumps every 1-9 minor tick per decade, which is far too dense. Reduce to the
// conventional 1/2/5 mantissas and cull to ≥ 70px apart so the labels stay legible.
function cleanLogTicks(scale) {
  const onesTwosFives = scale.ticks().filter((t) => {
    const m = t / Math.pow(10, Math.floor(Math.log10(t) + 1e-9));
    return [1, 2, 5].some((k) => Math.abs(m - k) < 1e-6);
  });
  const kept = [];
  let lastPx = -Infinity;
  for (const t of onesTwosFives) {
    const px = scale(t);
    if (px - lastPx >= 70) { kept.push(t); lastPx = px; }
  }
  return kept;
}

const mode = new URLSearchParams(location.search).get('mode') === 'log' ? 'log' : 'linear';

const container    = document.getElementById('chart');
const jitterToggle = document.getElementById('jitter-toggle');
const themeToggle  = document.getElementById('theme-toggle');
document.getElementById('chart-title').textContent = mode === 'log' ? 'Log scale' : 'Linear scale';

let dataset = null;
let jitterEnabled = true;

// Theme follows the system on load; the toggle is a manual override.
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
let userOverrodeTheme = false;
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀ Light' : '☾ Dark';
}
applyTheme(systemDark.matches ? 'dark' : 'light');
systemDark.addEventListener('change', (e) => { if (!userOverrodeTheme) applyTheme(e.matches ? 'dark' : 'light'); });
themeToggle.addEventListener('click', () => {
  userOverrodeTheme = true;
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

function render() {
  if (!dataset) return;
  const w = container.clientWidth, h = container.clientHeight;
  const innerW = w - MARGIN.left - MARGIN.right;
  const pts = dataset.points;
  const [xMin, xMax] = extent(pts, (d) => d.x);
  const xScale = mode === 'log'
    ? scaleLog().domain([xMin, xMax]).range([0, innerW])
    : scaleLinear().domain([0, xMax]).range([0, innerW]).nice();
  const el = createChart(pts, xScale, {
    width: w, height: h,
    xLabel: dataset.xLabel, yLabel: dataset.yLabel,
    xFormat: dataset.xFormat, yFormat: dataset.yFormat,
    rankNoun: dataset.noun,
    jitter: jitterEnabled,
  });
  // Tidy the log x-axis (base-chart's generic .ticks(6) leaves a log axis over-dense).
  if (mode === 'log') {
    select(el).select('.x-axis')
      .call(axisBottom(xScale).tickValues(cleanLogTicks(xScale)).tickFormat(makeFmt(dataset.xFormat)));
  }
  container.replaceChildren(el);
}

jitterToggle.addEventListener('change', () => { jitterEnabled = jitterToggle.checked; render(); });

let resizeTimer;
new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 120); }).observe(container);

loadCryptoPunks2024().then((d) => { dataset = d; render(); });
