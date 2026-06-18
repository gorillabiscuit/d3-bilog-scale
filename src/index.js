import { createLinearChart }   from './chart/linear-chart.js';
import { createLogChart }      from './chart/log-chart.js';
import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { LOADERS }             from './data/loaders.js';

const status          = document.getElementById('status');
const datasetSelector = document.getElementById('dataset-selector');

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

  const containers = {
    linear:       document.getElementById('chart-linear'),
    log:          document.getElementById('chart-log'),
    experimental: document.getElementById('chart-adaptive'),
  };

  const opts = { xLabel, yLabel, xFormat, yFormat };

  containers.linear.replaceChildren(
    createLinearChart(points, { width: containers.linear.clientWidth, ...opts })
  );
  containers.log.replaceChildren(
    createLogChart(points, { width: containers.log.clientWidth, ...opts })
  );
  containers.experimental.replaceChildren(
    createAdaptiveChart(points, { width: containers.experimental.clientWidth, ...opts })
  );
}

datasetSelector.addEventListener('change', e => load(e.target.value));

// Re-render on resize — debounced to avoid thrashing during drag
let _resizeTimer;
const ro = new ResizeObserver(() => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(renderCharts, 120);
});
document.querySelectorAll('.chart-container').forEach(el => ro.observe(el));

load(datasetSelector.value);
