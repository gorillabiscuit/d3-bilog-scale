import { createLinearChart }   from './chart/linear-chart.js';
import { createLogChart }      from './chart/log-chart.js';
import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { detectScaleType }     from './scale/detect.js';
import { windowQuantile, windowKDE, windowMixture } from './scale/window.js';
import { LOADERS }             from './data/loaders.js';

const WINDOW_FNS = { quantile: windowQuantile, kde: windowKDE, mixture: windowMixture };

const status          = document.getElementById('status');
const datasetSelector = document.getElementById('dataset-selector');
const scaleMode       = document.getElementById('scale-mode');
const windowMethod    = document.getElementById('window-method');
const alphaSlider     = document.getElementById('alpha-slider');
const alphaValue      = document.getElementById('alpha-value');
const sliderHint      = document.getElementById('slider-hint');

let currentDataset = null;

function updateSliderState() {
  const isLog = scaleMode.value === 'log';
  alphaSlider.disabled = isLog;
  alphaSlider.style.opacity = isLog ? '0.3' : '1';
  windowMethod.disabled = isLog;
  windowMethod.style.opacity = isLog ? '0.3' : '1';
  document.getElementById('window-method-label').style.opacity = isLog ? '0.3' : '1';
  sliderHint.textContent = isLog ? 'not applicable for log scale' : '← narrower  |  wider →';
}

async function load(datasetKey) {
  status.textContent = 'Loading…';
  try {
    currentDataset = await LOADERS[datasetKey]();
    status.textContent = `${currentDataset.points.length} points — ${currentDataset.description}`;
    // Auto-detect and pre-select, but don't override a manual user choice
    // (we reset on every dataset change since it's a new dataset)
    scaleMode.value = detectScaleType(currentDataset.points.map(d => d.x));
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
  const adaptC  = document.getElementById('chart-adaptive');

  linearC.replaceChildren(createLinearChart(points, { width: linearC.clientWidth, height: linearC.clientHeight, ...opts }));
  logC.replaceChildren(createLogChart(points, { width: logC.clientWidth, height: logC.clientHeight, ...opts }));

  renderExperimental();
}

function renderExperimental() {
  if (!currentDataset) return;
  const { points, xLabel, yLabel, xFormat = '~s', yFormat = '~s' } = currentDataset;
  const slider = +alphaSlider.value;
  const method = windowMethod.value;
  const mode   = scaleMode.value;

  const container = document.getElementById('chart-adaptive');
  container.replaceChildren(
    createAdaptiveChart(points, {
      width: container.clientWidth, height: container.clientHeight,
      mode, windowMethod: method, window: slider,
      xLabel, yLabel, xFormat, yFormat,
    })
  );

  // Show the actual window range so the user can see what domain is covered
  const rangeEl = document.getElementById('window-range');
  if (rangeEl && mode === 'piecewise') {
    const values = points.map(d => d.x);
    const winFn  = WINDOW_FNS[method] ?? windowQuantile;
    const { xLo, xHi } = winFn(values, slider);
    const fmt = xFormat === 'currency'
      ? v => { const a=Math.abs(v); return a>=1e9?`$${+(v/1e9).toPrecision(3)}B`:a>=1e6?`$${+(v/1e6).toPrecision(3)}M`:a>=1e3?`$${+(v/1e3).toPrecision(3)}k`:`$${+v.toPrecision(3)}`; }
      : v => { const a=Math.abs(v); return a>=1e9?`${+(v/1e9).toPrecision(3)}B`:a>=1e6?`${+(v/1e6).toPrecision(3)}M`:a>=1e3?`${+(v/1e3).toPrecision(3)}k`:`${+v.toPrecision(3)}`; };
    rangeEl.textContent = `${fmt(xLo)} – ${fmt(xHi)}`;
  } else if (rangeEl) {
    rangeEl.textContent = '';
  }

  updateSliderState();
}

datasetSelector.addEventListener('change', e => load(e.target.value));
scaleMode.addEventListener('change', renderExperimental);
windowMethod.addEventListener('change', renderExperimental);

let _raf = null;
alphaSlider.addEventListener('input', () => {
  alphaValue.textContent = (+alphaSlider.value).toFixed(2);
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
