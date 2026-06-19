import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { makeFmt }             from './chart/base-chart.js';
import { windowQuantile }      from './scale/window.js';
import { LOADERS }             from './data/loaders.js';

// ── Theme presets ────────────────────────────────────────────────────────────

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
  },
};

// ── UI refs ──────────────────────────────────────────────────────────────────

const status          = document.getElementById('status');
const datasetSelector = document.getElementById('dataset-selector');
const alphaSlider     = document.getElementById('alpha-slider');
const alphaValue      = document.getElementById('alpha-value');
const themeToggle     = document.getElementById('theme-toggle');
const dotSizeSelect   = document.getElementById('dot-size');
const dotOpacitySlider= document.getElementById('dot-opacity');
const dotOpacityValue = document.getElementById('dot-opacity-value');
const tailTicksSlider = document.getElementById('tail-ticks');
const tailTicksValue  = document.getElementById('tail-ticks-value');

// ── App state ────────────────────────────────────────────────────────────────

let currentDataset = null;
// Drag-handle overrides: null = use slider-derived defaults; set on dragend
let manualXLo = null, manualXHi = null;
let manualQLo = null, manualQHi = null;

let currentTheme = 'dark';
let dotRadius    = undefined;   // undefined = auto
let dotOpacity   = undefined;   // undefined = auto
let tailTicks    = 6;

// ── Data loading ─────────────────────────────────────────────────────────────

async function load(datasetKey) {
  status.textContent = 'Loading…';
  try {
    currentDataset = await LOADERS[datasetKey]();
    status.textContent = `${currentDataset.points.length} points — ${currentDataset.description}`;
    manualXLo = null; manualXHi = null;
    manualQLo = null; manualQHi = null;
    renderCharts();
  } catch (err) {
    status.textContent = `Failed to load: ${err.message}`;
    console.error(err);
  }
}

function renderCharts() {
  renderExperimental();
}

// ── Range display ─────────────────────────────────────────────────────────────

function updateRangeDisplay(xLo, xHi, xFormat) {
  const rangeEl = document.getElementById('window-range');
  if (!rangeEl) return;
  const fmt = makeFmt(xFormat);
  rangeEl.textContent = `${fmt(xLo)} – ${fmt(xHi)}`;
}

// ── Chart render ──────────────────────────────────────────────────────────────

function renderExperimental() {
  if (!currentDataset) return;
  const { points, xLabel, yLabel, xFormat = '~s', yFormat = '~s' } = currentDataset;
  const slider = +alphaSlider.value;
  const theme  = THEMES[currentTheme];

  const container = document.getElementById('chart-adaptive');
  container.replaceChildren(
    createAdaptiveChart(points, {
      width: container.clientWidth, height: container.clientHeight,
      mode: 'piecewise', window: slider,
      xLo: manualXLo ?? undefined,
      xHi: manualXHi ?? undefined,
      qLo: manualQLo ?? undefined,
      qHi: manualQHi ?? undefined,
      onWindowDrag: ({ xLo, xHi }) => updateRangeDisplay(xLo, xHi, xFormat),
      onWindowChange: ({ xLo, xHi, qLo, qHi }) => {
        manualXLo = xLo; manualXHi = xHi;
        if (qLo != null) manualQLo = qLo;
        if (qHi != null) manualQHi = qHi;
        renderExperimental();
      },
      xLabel, yLabel, xFormat, yFormat,
      // appearance
      ...theme,
      dotRadius,
      dotOpacity,
      tailTicks,
    })
  );

  // Initialise range display from current state
  const rangeEl = document.getElementById('window-range');
  if (rangeEl) {
    const values = points.map(d => d.x);
    const { xLo, xHi } = manualXLo != null && manualXHi != null
      ? { xLo: manualXLo, xHi: manualXHi }
      : windowQuantile(values, slider);
    updateRangeDisplay(xLo, xHi, xFormat);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

datasetSelector.addEventListener('change', e => load(e.target.value));

let _raf = null;
alphaSlider.addEventListener('input', () => {
  const slider = +alphaSlider.value;
  alphaValue.textContent = slider.toFixed(2);

  // Pixel center: keep wherever the user panned to (default 0.5)
  const qCenter = manualQLo != null ? (manualQLo + manualQHi) / 2 : 0.5;
  manualQLo = Math.max(0, qCenter - slider / 2);
  manualQHi = Math.min(1, qCenter + slider / 2);
  // Domain: leave manualXLo/XHi untouched.
  // - If panned: the domain range stays fixed; slider only changes how much pixel space it occupies.
  // - If not panned: manualXLo/XHi are null, so windowQuantile runs on next render as normal.

  if (_raf) cancelAnimationFrame(_raf);
  _raf = requestAnimationFrame(() => { renderExperimental(); _raf = null; });
});

themeToggle.addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  themeToggle.textContent = currentTheme === 'dark' ? '☀ Light' : '☾ Dark';
  renderExperimental();
});

dotSizeSelect.addEventListener('change', () => {
  const v = dotSizeSelect.value;
  dotRadius = v === 'auto' ? undefined : +v;
  renderExperimental();
});

dotOpacitySlider.addEventListener('input', () => {
  const v = +dotOpacitySlider.value;
  dotOpacityValue.textContent = v.toFixed(2);
  dotOpacity = v === 0 ? undefined : v;
  renderExperimental();
});

tailTicksSlider.addEventListener('input', () => {
  tailTicks = +tailTicksSlider.value;
  tailTicksValue.textContent = tailTicks;
  renderExperimental();
});

let _resizeTimer;
const ro = new ResizeObserver(() => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(renderCharts, 120);
});
document.querySelectorAll('.chart-container').forEach(el => ro.observe(el));

load(datasetSelector.value);
