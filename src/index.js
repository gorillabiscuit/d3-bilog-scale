import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { windowQuantile }      from './scale/window.js';
import { LOADERS }             from './data/loaders.js';

const status          = document.getElementById('status');
const datasetSelector = document.getElementById('dataset-selector');
const alphaSlider     = document.getElementById('alpha-slider');
const alphaValue      = document.getElementById('alpha-value');

let currentDataset = null;
// Drag-handle overrides: null = use slider-derived defaults; set on dragend
let manualXLo = null, manualXHi = null;
let manualQLo = null, manualQHi = null;

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

function makeFmt(xFormat) {
  return xFormat === 'currency'
    ? v => { const a = Math.abs(v); return a >= 1e9 ? `$${+(v/1e9).toPrecision(3)}B` : a >= 1e6 ? `$${+(v/1e6).toPrecision(3)}M` : a >= 1e3 ? `$${+(v/1e3).toPrecision(3)}k` : `$${+v.toPrecision(3)}`; }
    : v => { const a = Math.abs(v); return a >= 1e9 ? `${+(v/1e9).toPrecision(3)}B`  : a >= 1e6 ? `${+(v/1e6).toPrecision(3)}M`  : a >= 1e3 ? `${+(v/1e3).toPrecision(3)}k`  : `${+v.toPrecision(3)}`; };
}

function updateRangeDisplay(xLo, xHi, xFormat) {
  const rangeEl = document.getElementById('window-range');
  if (!rangeEl) return;
  const fmt = makeFmt(xFormat);
  rangeEl.textContent = `${fmt(xLo)} – ${fmt(xHi)}`;
}

function renderExperimental() {
  if (!currentDataset) return;
  const { points, xLabel, yLabel, xFormat = '~s', yFormat = '~s' } = currentDataset;
  const slider = +alphaSlider.value;

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

let _resizeTimer;
const ro = new ResizeObserver(() => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(renderCharts, 120);
});
document.querySelectorAll('.chart-container').forEach(el => ro.observe(el));

load(datasetSelector.value);
