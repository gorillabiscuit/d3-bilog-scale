import { createLinearChart }   from './chart/linear-chart.js';
import { createLogChart }      from './chart/log-chart.js';
import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { LOADERS }             from './data/loaders.js';

const status          = document.getElementById('status');
const datasetSelector = document.getElementById('dataset-selector');
const alphaSlider     = document.getElementById('alpha-slider');
const alphaValue      = document.getElementById('alpha-value');

let currentDataset = null;

async function load(datasetKey) {
  status.textContent = 'Loading…';
  try {
    currentDataset = await LOADERS[datasetKey]();
    status.textContent = `${currentDataset.points.length} points — ${currentDataset.description}`;
    renderCharts();
  } catch (err) {
    status.textContent = `Failed to load: ${err.message}`;
    console.error(err);
  }
}

function renderCharts() {
  if (!currentDataset) return;

  const { points, xLabel, yLabel, xFormat = '~s', yFormat = '~s' } = currentDataset;
  const window = +alphaSlider.value;

  const containers = {
    linear:       document.getElementById('chart-linear'),
    log:          document.getElementById('chart-log'),
    experimental: document.getElementById('chart-adaptive'),
  };

  const opts = { xLabel, yLabel, xFormat, yFormat };

  containers.linear.replaceChildren(
    createLinearChart(points, { width: containers.linear.clientWidth, height: containers.linear.clientHeight, ...opts })
  );
  containers.log.replaceChildren(
    createLogChart(points, { width: containers.log.clientWidth, height: containers.log.clientHeight, ...opts })
  );
  containers.experimental.replaceChildren(
    createAdaptiveChart(points, { width: containers.experimental.clientWidth, height: containers.experimental.clientHeight, window, ...opts })
  );
}

function renderExperimental() {
  if (!currentDataset) return;
  const { points, xLabel, yLabel, xFormat = '~s', yFormat = '~s' } = currentDataset;
  const container = document.getElementById('chart-adaptive');
  container.replaceChildren(
    createAdaptiveChart(points, {
      width:  container.clientWidth,
      height: container.clientHeight,
      window: +alphaSlider.value,
      xLabel, yLabel, xFormat, yFormat,
    })
  );
}

datasetSelector.addEventListener('change', e => load(e.target.value));

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
