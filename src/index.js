import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { makeFmt }             from './utils/format.js';
import { LOADERS }             from './data/loaders.js';

// ── UI refs ──────────────────────────────────────────────────────────────────

const status          = document.getElementById('status');
const datasetSelector = document.getElementById('dataset-selector');
const alphaSlider     = document.getElementById('alpha-slider');
const alphaValue      = document.getElementById('alpha-value');
const themeToggle     = document.getElementById('theme-toggle');
const jitterToggle    = document.getElementById('jitter-toggle');

// ── App state ────────────────────────────────────────────────────────────────

let currentDataset = null;
// Drag-handle overrides: null = use slider-derived defaults; set on dragend
let manualXLo = null, manualXHi = null;
let manualQLo = null, manualQHi = null;

let currentTheme = 'dark';
let jitterEnabled = true;
let chartNode = null;  // current SVG element — setJitter() animates it in place

// ── Data loading ─────────────────────────────────────────────────────────────

async function load(datasetKey) {
  status.textContent = 'Loading…';
  const container = document.getElementById('chart-adaptive');
  container.setAttribute('data-loading', '');
  try {
    currentDataset = await LOADERS[datasetKey]();
    status.textContent = `${currentDataset.points.length} points — ${currentDataset.description}`;
    manualXLo = null; manualXHi = null;
    manualQLo = null; manualQHi = null;
    renderExperimental(true);
  } catch (err) {
    status.textContent = `Failed to load: ${err.message}`;
    console.error(err);
  } finally {
    container.removeAttribute('data-loading');
  }
}

// ── Range display ─────────────────────────────────────────────────────────────

function updateRangeDisplay(xLo, xHi, xFormat) {
  const rangeEl = document.getElementById('window-range');
  if (!rangeEl) return;
  const fmt = makeFmt(xFormat);
  rangeEl.textContent = `${fmt(xLo)} – ${fmt(xHi)}`;
}

// ── Chart render ──────────────────────────────────────────────────────────────

// entranceAnimation=true: dots render at true positions then spring to jittered
// after first paint — used on new data loads. false: render at correct jitter
// state instantly — used on re-renders from slider/drag so there's no lag.
function renderExperimental(entranceAnimation = false) {
  if (!currentDataset) return;
  const { points, xLabel, yLabel, xFormat = '~s', yFormat = '~s', noun = 'points' } = currentDataset;
  const slider = +alphaSlider.value;

  const container = document.getElementById('chart-adaptive');
  const el = createAdaptiveChart(points, {
    width: container.clientWidth, height: container.clientHeight,
    mode: 'piecewise', window: slider,
    xLo: manualXLo ?? undefined,
    xHi: manualXHi ?? undefined,
    qLo: manualQLo ?? undefined,
    qHi: manualQHi ?? undefined,
    onWindowDrag: ({ xLo, xHi, qLo, qHi }) => {
      updateRangeDisplay(xLo, xHi, xFormat);
      if (qLo != null && qHi != null) {
        const w = qHi - qLo;
        alphaSlider.value = w;
        alphaValue.textContent = w.toFixed(2);
      }
    },
    onWindowChange: ({ xLo, xHi, qLo, qHi }) => {
      manualXLo = xLo; manualXHi = xHi;
      if (qLo != null) manualQLo = qLo;
      if (qHi != null) manualQHi = qHi;
      if (qLo != null && qHi != null) {
        const w = qHi - qLo;
        alphaSlider.value = w;
        alphaValue.textContent = w.toFixed(2);
      }
      renderExperimental();
    },
    xLabel, yLabel, xFormat, yFormat, rankNoun: noun,
    jitter: entranceAnimation ? false : jitterEnabled,
  });
  container.replaceChildren(el);
  chartNode = el;

  if (jitterEnabled && entranceAnimation) {
    // Two RAF calls: first frame paints the initial (true) positions,
    // second triggers the spring so the user sees dots settle in.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chartNode?.setJitter(true, 700);
    }));
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

jitterToggle.addEventListener('change', () => {
  jitterEnabled = jitterToggle.checked;
  chartNode?.setJitter(jitterEnabled);
});

themeToggle.addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  // Flip the attribute only — the chart's colours are CSS custom properties, so the live
  // SVG reskins instantly without a rebuild.
  document.documentElement.setAttribute('data-theme', currentTheme);
  themeToggle.textContent = currentTheme === 'dark' ? '☀ Light' : '☾ Dark';
});

// Double-click anywhere on the chart resets to the default data-driven window — the
// canonical d3 reset gesture (cf. d3-zoom / d3-brush). Reference-anchored handle drags make
// the window un-trappable, but this is the quick way back to the centred quantile view.
// Attached to the stable container (its SVG child is replaced on every render).
document.getElementById('chart-adaptive').addEventListener('dblclick', () => {
  alphaSlider.value = 0.5;
  alphaValue.textContent = '0.50';
  manualXLo = null; manualXHi = null;
  manualQLo = null; manualQHi = null;
  renderExperimental();
});

let _resizeTimer;
const ro = new ResizeObserver(() => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(renderExperimental, 120);
});
document.querySelectorAll('.chart-container').forEach(el => ro.observe(el));

load(datasetSelector.value);
