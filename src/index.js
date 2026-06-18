import { createLinearChart } from './chart/linear-chart.js';
import { createLogChart } from './chart/log-chart.js';
import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { LOADERS } from './data/loaders.js';

const status = document.getElementById('status');
const datasetSelector = document.getElementById('dataset-selector');
const methodSelector = document.getElementById('method-selector');

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
  const opts = {
    xLabel: currentDataset.xLabel,
    yLabel: currentDataset.yLabel,
    method: methodSelector.value,
  };
  createLinearChart(document.getElementById('chart-linear'), currentDataset.points, opts);
  createLogChart(document.getElementById('chart-log'), currentDataset.points, opts);
  createAdaptiveChart(document.getElementById('chart-adaptive'), currentDataset.points, opts);
}

datasetSelector.addEventListener('change', (e) => load(e.target.value));
methodSelector.addEventListener('change', () => renderCharts());

load(datasetSelector.value);
