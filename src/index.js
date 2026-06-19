import { createLinearChart }   from './chart/linear-chart.js';
import { createLogChart }      from './chart/log-chart.js';
import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { detectScaleType }     from './scale/detect.js';
import { windowQuantile }      from './scale/window.js';
import { LOADERS }             from './data/loaders.js';

const status          = document.getElementById('status');
const datasetSelector = document.getElementById('dataset-selector');
const scaleMode       = document.getElementById('scale-mode');
const alphaSlider     = document.getElementById('alpha-slider');
const alphaValue      = document.getElementById('alpha-value');
const sliderHint      = document.getElementById('slider-hint');

let currentDataset = null;
// Drag-handle overrides: null = use windowQuantile from slider; set on handle dragend
let manualXLo = null, manualXHi = null;

function updateSliderState() {
  const isLog = scaleMode.value === 'log';
  alphaSlider.disabled = isLog;
  alphaSlider.style.opacity = isLog ? '0.3' : '1';
  sliderHint.textContent = isLog ? 'not applicable for log scale' : '← narrower  |  wider →';
}

async function load(datasetKey) {
  status.textContent = 'Loading…';
  try {
    currentDataset = await LOADERS[datasetKey]();
    status.textContent = `${currentDataset.points.length} points — ${currentDataset.description}`;
    scaleMode.value = detectScaleType(currentDataset.points.map(d => d.x));
    manualXLo = null;
    manualXHi = null;
    renderCharts();
  } catch (err) {
    status.textContent = `Failed to load: ${err.message}`;
    console.error(err);
  }
}

function renderCharts() {
  if (!currentDataset) return;

  const { points, xLabel, yLabel, xFormat = '~s', yFormat = '~s' } = currentDataset;
  const opts = { xLabel, yLabel, xFormat, yFormat };

  const linearC = document.getElementById('chart-linear');
  const logC    = document.getElementById('chart-log');

  linearC.replaceChildren(createLinearChart(points, { width: linearC.clientWidth, height: linearC.clientHeight, ...opts }));
  logC.replaceChildren(createLogChart(points, { width: logC.clientWidth, height: logC.clientHeight, ...opts }));

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
  const mode   = scaleMode.value;

  const container = document.getElementById('chart-adaptive');
  container.replaceChildren(
    createAdaptiveChart(points, {
      width: container.clientWidth, height: container.clientHeight,
      mode, window: slider,
      xLo: manualXLo ?? undefined,
      xHi: manualXHi ?? undefined,
      onWindowDrag: mode === 'piecewise'
        ? ({ xLo, xHi }) => updateRangeDisplay(xLo, xHi, xFormat)
        : undefined,
      onWindowChange: mode === 'piecewise'
        ? ({ xLo, xHi }) => { manualXLo = xLo; manualXHi = xHi; renderExperimental(); }
        : undefined,
      xLabel, yLabel, xFormat, yFormat,
    })
  );

  // Initialise range display from current state
  const rangeEl = document.getElementById('window-range');
  if (rangeEl && mode === 'piecewise') {
    const values = points.map(d => d.x);
    const { xLo, xHi } = manualXLo != null && manualXHi != null
      ? { xLo: manualXLo, xHi: manualXHi }
      : windowQuantile(values, slider);
    updateRangeDisplay(xLo, xHi, xFormat);
  } else if (rangeEl) {
    rangeEl.textContent = '';
  }

  updateSliderState();
}

datasetSelector.addEventListener('change', e => load(e.target.value));
scaleMode.addEventListener('change', renderExperimental);

let _raf = null;
alphaSlider.addEventListener('input', () => {
  alphaValue.textContent = (+alphaSlider.value).toFixed(2);
  manualXLo = null;
  manualXHi = null;
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
