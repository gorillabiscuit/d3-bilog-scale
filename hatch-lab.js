// Hatch lab — renders the same NYC chart under a grid of hatch parameter variants so the
// best-looking encoding can be picked by eye. Dev-only page; not part of any build.
import { csvParse } from 'd3-dsv';
import { createAdaptiveChart } from './src/chart/adaptive-chart.js';

const urlTheme = new URLSearchParams(window.location.search).get('theme');
document.documentElement.setAttribute('data-theme', urlTheme === 'dark' ? 'dark' : 'light');

// The candidates — uniform hatch, varied in spacing (texture scale), opacity (weight),
// and direction. "current" is the default the embed ships with.
const VARIANTS = [
  { title: 'A — current (default)', opts: {} },
  { title: 'B — sparse, light', opts: { hatchSpacing: 12, hatchOpacity: 0.3 } },
  { title: 'C — dense, light', opts: { hatchSpacing: 6, hatchOpacity: 0.3 } },
  { title: 'D — sparse, standard weight', opts: { hatchSpacing: 12 } },
  { title: 'E — dense, heavy', opts: { hatchSpacing: 6, hatchOpacity: 0.6 } },
  { title: 'F — "/" direction', opts: { hatchAngle: -1 } },
  { title: 'G — fine grain, whisper', opts: { hatchSpacing: 5, hatchOpacity: 0.25 } },
  { title: 'H — coarse, soft', opts: { hatchSpacing: 16, hatchOpacity: 0.35 } },
];

const fmtOpts = (o) =>
  Object.entries({ hatchSpacing: 8, hatchOpacity: 0.45, hatchAngle: 1, ...o })
    .map(([k, v]) => `${k.replace('hatch', '').toLowerCase()}=${v}`)
    .join(' · ');

async function init() {
  const res = await fetch('/data/nyc-sample.csv');
  const text = await res.text();
  const points = csvParse(text)
    .map((r) => ({ x: +r.x, y: +r.y, label: r.label, meta: r.meta }))
    .filter((p) => p.x >= 1 && Number.isFinite(p.x) && Number.isFinite(p.y));

  const grid = document.getElementById('grid');

  for (const { title, opts } of VARIANTS) {
    const card = document.createElement('div');
    card.className = 'variant';
    card.innerHTML = `<h2>${title}</h2><p>${fmtOpts(opts)}</p><div class="chart-container"></div>`;
    grid.appendChild(card);

    const container = card.querySelector('.chart-container');
    // Per-card window state so a drag holds its position across the commit re-render.
    let state = {};
    const render = () => {
      const el = createAdaptiveChart(points, {
        width: container.clientWidth,
        height: container.clientHeight,
        mode: 'piecewise',
        windowFraction: 0.5,
        tailTexture: 'hatch',
        spread: null,
        showHint: false,
        xLabel: 'Sale price (USD)',
        yLabel: '$/sq ft',
        xFormat: 'currency',
        yFormat: 'currency',
        xLo: state.xLo, xHi: state.xHi,
        qLo: state.qLo, qHi: state.qHi,
        onWindowChange: ({ xLo, xHi, qLo, qHi }) => {
          state = { xLo, xHi, qLo: qLo ?? state.qLo, qHi: qHi ?? state.qHi };
          render();
        },
        ...opts,
      });
      container.replaceChildren(el);
    };
    render();
  }
}

init();
