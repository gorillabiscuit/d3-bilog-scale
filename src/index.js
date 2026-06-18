import { createLinearChart }   from './chart/linear-chart.js';
import { createLogChart }      from './chart/log-chart.js';
import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { LOADERS }             from './data/loaders.js';

const status          = document.getElementById('status');
const datasetSelector = document.getElementById('dataset-selector');
const methodSelector  = document.getElementById('method-selector');

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
  const method = methodSelector.value;

  const containers = {
    linear:   document.getElementById('chart-linear'),
    log:      document.getElementById('chart-log'),
    adaptive: document.getElementById('chart-adaptive'),
  };

  // Each chart function returns svg.node() — no container mutation, Observable-compatible.
  // replaceChildren() is the idiomatic DOM API for swapping a container's content.
  const opts = { xLabel, yLabel, xFormat, yFormat };

  containers.linear.replaceChildren(
    createLinearChart(points, { width: containers.linear.clientWidth, ...opts })
  );
  containers.log.replaceChildren(
    createLogChart(points, { width: containers.log.clientWidth, ...opts })
  );
  containers.adaptive.replaceChildren(
    createAdaptiveChart(points, { width: containers.adaptive.clientWidth, method, ...opts })
  );
}

datasetSelector.addEventListener('change', e => load(e.target.value));
methodSelector.addEventListener('change', () => renderCharts());

// Re-render on resize — debounced to avoid thrashing during drag
let _resizeTimer;
const ro = new ResizeObserver(() => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(renderCharts, 120);
});
document.querySelectorAll('.chart-container').forEach(el => ro.observe(el));

load(datasetSelector.value);
