import { createLinearChart } from './chart/linear-chart.js';
import { createLogChart } from './chart/log-chart.js';
import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { LOADERS } from './data/loaders.js';

const status = document.getElementById('status');
const selector = document.getElementById('dataset-selector');

async function render(datasetKey) {
  status.textContent = 'Loading…';
  try {
    const dataset = await LOADERS[datasetKey]();
    status.textContent = `${dataset.points.length} points — ${dataset.description}`;
    const opts = { xLabel: dataset.xLabel, yLabel: dataset.yLabel };
    createLinearChart(document.getElementById('chart-linear'), dataset.points, opts);
    createLogChart(document.getElementById('chart-log'), dataset.points, opts);
    createAdaptiveChart(document.getElementById('chart-adaptive'), dataset.points, opts);
  } catch (err) {
    status.textContent = `Failed to load: ${err.message}`;
    console.error(err);
  }
}

selector.addEventListener('change', (e) => render(e.target.value));
render(selector.value);
