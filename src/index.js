import { createAdaptiveChart } from './chart/adaptive-chart.js';
import { makeFmt }             from './utils/format.js';
import { LOADERS }             from './data/loaders.js';
import { registerSvgSaveShortcut } from './save-svg.js'; // app-only; not part of the Observable submission

// ── UI refs ──────────────────────────────────────────────────────────────────

const status          = document.getElementById('status');
const datasetSelector = document.getElementById('dataset-selector');
const alphaSlider     = document.getElementById('alpha-slider');
const alphaValue      = document.getElementById('alpha-value');
const themeToggle     = document.getElementById('theme-toggle');
const resetScale      = document.getElementById('reset-scale');
const jitterToggle    = document.getElementById('jitter-toggle');

// ── App state ────────────────────────────────────────────────────────────────

let currentDataset = null;
// Drag-handle overrides: null = use slider-derived defaults; set on dragend
let manualXLo = null, manualXHi = null;
let manualQLo = null, manualQHi = null;
// Travel ("focus") window: an uncapped window placed exactly on a clicked/arrowed log section.
// Null = not travelled. Kept separate from manual* so the capped and uncapped paths can't collide.
let focusXLo = null, focusXHi = null;
// Pixel position within a focused window, set only once the user drags/pans it — a fresh travel
// leaves these null so the box centres itself in the new section (the intended arrival look);
// null here (unlike focusXLo/XHi) means "let the scale centre it," not "not travelled."
let focusQLo = null, focusQHi = null;

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
let userOverrodeTheme = false;
let currentTheme = systemDark.matches ? 'dark' : 'light';
let spreadEnabled = true;
let chartNode = null;       // current SVG element — setSpread() animates it in place
let _spreadGeneration = 0; // increments on every render; RAF checks it to avoid stale animations

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
    focusXLo = null; focusXHi = null;
    focusQLo = null; focusQHi = null;
    renderExperimental(true);
    refocusGraph(); // hand focus back to the chart after a dataset change (no-op on first load)
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

// entranceAnimation=true: dots render at true positions then spring to the spread
// after first paint — used on new data loads. false: render at correct spread
// state instantly — used on re-renders from slider/drag so there's no lag.
function renderExperimental(entranceAnimation = false, animateSpread = false) {
  if (!currentDataset) return;
  const { points, xLabel, yLabel, xFormat = '~s', yFormat = '~s', yTicks, noun = 'points' } = currentDataset;
  const slider = +alphaSlider.value;

  const container = document.getElementById('chart-adaptive');
  const el = createAdaptiveChart(points, {
    width: container.clientWidth, height: container.clientHeight,
    mode: 'piecewise', windowFraction: slider,
    xLo: manualXLo ?? undefined,
    xHi: manualXHi ?? undefined,
    // manualQLo/QHi and focusQLo/QHi are mutually exclusive (only one mode is active at a time) —
    // combine so a drag-while-focused's pixel position reaches the scale the same way a
    // drag-while-capped's does.
    qLo: (manualQLo ?? focusQLo) ?? undefined,
    qHi: (manualQHi ?? focusQHi) ?? undefined,
    focusXLo: focusXLo ?? undefined,
    focusXHi: focusXHi ?? undefined,
    onWindowDrag: ({ xLo, xHi, qLo, qHi }) => {
      updateRangeDisplay(xLo, xHi, xFormat);
      if (qLo != null && qHi != null) {
        const w = qHi - qLo;
        alphaSlider.value = w;
        alphaValue.textContent = w.toFixed(2);
      }
    },
    onWindowChange: ({ xLo, xHi, qLo, qHi }) => {
      if (focusXLo != null) {
        // Pan/drag while travelled stays in the uncapped focus — update it, not the capped window.
        // qLo/qHi (the pixel position) must persist here too, or the next render has a domain
        // override with no matching pixel override and rebuild() falls back to centring the box
        // via the window fraction — the domain moves to where you dragged, but the box "snaps"
        // back to centre within it.
        focusXLo = xLo; focusXHi = xHi;
        if (qLo != null) focusQLo = qLo;
        if (qHi != null) focusQHi = qHi;
      } else {
        manualXLo = xLo; manualXHi = xHi;
        if (qLo != null) manualQLo = qLo;
        if (qHi != null) manualQHi = qHi;
        if (qLo != null && qHi != null) {
          const w = qHi - qLo;
          alphaSlider.value = w;
          alphaValue.textContent = w.toFixed(2);
        }
      }
      renderExperimental(false, true);
    },
    onTravel: ({ xLo, xHi }) => {
      // A click/arrow travel completed (already animated in the chart). Persist the uncapped focus
      // so it survives rebuilds (resize/slider/spread); clear the capped overrides so they can't
      // fight it. No re-render here — re-rendering now would replace the SVG mid-gesture and could
      // swallow a following double-click; the next natural rebuild re-applies the focus cleanly.
      focusXLo = xLo; focusXHi = xHi;
      focusQLo = null; focusQHi = null; // fresh travel centres in the new section
      manualXLo = null; manualXHi = null; manualQLo = null; manualQHi = null;
      updateRangeDisplay(xLo, xHi, xFormat);
    },
    xLabel, yLabel, xFormat, yFormat, yTicks, rankNoun: noun,
    // null  → skip simulation (spread permanently off; setSpread will not be called)
    // false → run simulation, start at true positions (entrance animation; setSpread(true) fires after first paint)
    // true  → run simulation, start at spread positions
    spread: spreadEnabled ? (entranceAnimation ? false : true) : null,
    // Seed the new spread with the outgoing chart's settled offsets so dots keep their side of
    // the cluster across a re-render instead of re-rolling who-goes-up/who-goes-down (visible as
    // dots swapping places on every handle release). Entrance renders (dataset load, spread
    // re-enable) deliberately start fresh; base-chart also drops a seed whose length mismatches.
    spreadSeed: !entranceAnimation ? chartNode?.spreadOffsets : undefined,
  });
  // Stop any pan auto-scroll timer from the previous chart before tearing it down.
  chartNode?.stopPan?.();
  // A pan/handle release recomputes the spread; capture the outgoing dots' cy (by index — same
  // dataset, same order) so the rebuilt chart can ease from them to the new spread instead of
  // snapping. Captured before replaceChildren destroys the old SVG.
  // Only the data dots (.dots circle) — NOT the handles' grip circles, which would shift the index
  // alignment and make each dot ease from a neighbour's old position.
  const oldCy = (animateSpread && spreadEnabled && chartNode)
    ? Array.from(chartNode.querySelectorAll('.dots circle')).map(c => +c.getAttribute('cy'))
    : null;
  // Preserve keyboard focus across the rebuild: a deferred keyboard-nudge commit replaces the
  // SVG, which would otherwise drop focus and strand a keyboard/screen-reader user mid-adjust.
  const focusSel = ['.handle-left', '.handle-right', '.pan-overlay']
    .find(sel => document.activeElement?.matches?.(sel));
  container.replaceChildren(el);
  chartNode = el;
  if (focusSel) el.querySelector(focusSel)?.focus();

  if (spreadEnabled && entranceAnimation) {
    // Two RAF calls: first frame paints the initial (true) positions, second
    // triggers the spring so the user sees dots settle in.
    // Generation guard: if another render fires before these RAFs execute
    // (e.g. rapid dataset switching), only the latest render should animate.
    const gen = ++_spreadGeneration;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (_spreadGeneration === gen) chartNode?.setSpread(true, 700);
    }));
  } else if (oldCy) {
    // Ease the recomputed spread from the outgoing positions. Run synchronously (before paint) so
    // there's no flash at the new positions, and bump the generation so any pending entrance RAF
    // from a prior render is cancelled.
    _spreadGeneration++;
    chartNode.springSpreadFrom?.(oldCy, 320);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

// Track whether the chart held keyboard focus just before focus moved away (e.g. to a toolbar
// control). A control-driven re-render replaces the SVG, and clicking the control already moved
// focus off the chart, so arrow-key travel silently stops until the user clicks back in.
// refocusGraph() hands focus back when the user had been driving the chart; the guard means we never
// steal focus from a keyboard user who tabbed straight to a control. (The slider is left alone — its
// drag must keep focus.)
let graphWasFocused = false;
document.addEventListener('focusout', (e) => {
  graphWasFocused = !!e.target?.matches?.('.pan-overlay, .handle-left, .handle-right');
}, true);
function refocusGraph() {
  if (graphWasFocused) chartNode?.querySelector('.pan-overlay')?.focus();
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

jitterToggle.addEventListener('change', () => {
  spreadEnabled = jitterToggle.checked;
  if (spreadEnabled) {
    // Current chart was rendered with spread:null (no simulation); need a full re-render
    // so spread positions are computed. Entrance animation gives the spring effect.
    renderExperimental(true);
  } else {
    chartNode?.setSpread(false);
  }
  refocusGraph(); // the toggle stole focus; keep arrow-key travel alive without a click back in
});

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀ Light' : '☾ Dark';
}

// Initialise from system preference; keep in sync unless the user overrides manually.
applyTheme(systemDark.matches ? 'dark' : 'light');
systemDark.addEventListener('change', (e) => {
  if (!userOverrodeTheme) applyTheme(e.matches ? 'dark' : 'light');
});

themeToggle.addEventListener('click', () => {
  userOverrodeTheme = true;
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
});

// Clear the manual overrides and rebuild the clean auto view. Called at the end of the
// reset animation, or directly when there's no chart to animate.
function commitAutoView() {
  alphaSlider.value = 0.5;
  alphaValue.textContent = '0.50';
  manualXLo = null; manualXHi = null;
  manualQLo = null; manualQHi = null;
  focusXLo = null; focusXHi = null;
  focusQLo = null; focusQHi = null;
  renderExperimental();
  refocusGraph(); // reset via the ↺ button moves focus to it; return it so arrows keep working
}

function resetScaleState() {
  // No manual override / no travel (already auto), or no animated chart: just snap.
  if ((manualXLo == null && manualQLo == null && focusXLo == null) || !chartNode?.animateToAuto) {
    commitAutoView();
    return;
  }
  // animateToAuto cancels any in-flight animation of its own, so repeat triggers just restart it.
  const startSlider = +alphaSlider.value;
  chartNode.animateToAuto(
    0.5,
    (e) => {                          // tween the slider readout alongside the window
      const v = startSlider + (0.5 - startSlider) * e;
      alphaSlider.value = v;
      alphaValue.textContent = v.toFixed(2);
    },
    commitAutoView,
  );
}

resetScale.addEventListener('click', resetScaleState);

// Double-click anywhere on the chart resets to the default data-driven window — the
// canonical d3 reset gesture (cf. d3-zoom / d3-brush). Reference-anchored handle drags make
// the window un-trappable, but this is the quick way back to the centred quantile view.
// Attached to the stable container (its SVG child is replaced on every render).
document.getElementById('chart-adaptive').addEventListener('dblclick', resetScaleState);

let _resizeTimer, _lastW = 0, _lastH = 0;
const ro = new ResizeObserver(entries => {
  // Re-render only on a real size change. Each render calls replaceChildren on the chart, which can
  // re-notify the observer at the SAME size; without this guard that spurious notification fires a
  // plain (un-animated) re-render ~120ms later that replaces the chart mid-transition and snaps the
  // spread animation — and can loop. Ignoring no-op notifications lets the release animation finish.
  const { width, height } = entries[0].contentRect;
  const w = Math.round(width), h = Math.round(height);
  if (w === _lastW && h === _lastH) return;
  _lastW = w; _lastH = h;
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => renderExperimental(), 120);
});
document.querySelectorAll('.chart-container').forEach(el => ro.observe(el));

// Press "S" to save the current chart as an SVG (app-only convenience, kept out of the chart code).
registerSvgSaveShortcut(() => chartNode, () => currentDataset?.title ?? datasetSelector.value);

load(datasetSelector.value);
