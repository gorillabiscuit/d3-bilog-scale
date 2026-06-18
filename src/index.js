import { createLinearChart }   from './chart/linear-chart.js';
import { createLogChart }      from './chart/log-chart.js';
import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { detectScaleType }     from './scale/detect.js';
import { LOADERS }             from './data/loaders.js';

const status          = document.getElementById('status');
const datasetSelector = document.getElementById('dataset-selector');
const scaleMode       = document.getElementById('scale-mode');
const alphaSlider     = document.getElementById('alpha-slider');
const alphaValue      = document.getElementById('alpha-value');
const sliderHint      = document.getElementById('slider-hint');

let currentDataset = null;

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
  const container = document.getElementById('chart-adaptive');
  container.replaceChildren(
    createAdaptiveChart(points, {
      width:  container.clientWidth,
      height: container.clientHeight,
      mode:   scaleMode.value,
      window: +alphaSlider.value,
      xLabel, yLabel, xFormat, yFormat,
    })
  );
  updateSliderState();
}

datasetSelector.addEventListener('change', e => load(e.target.value));
scaleMode.addEventListener('change', renderExperimental);

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
