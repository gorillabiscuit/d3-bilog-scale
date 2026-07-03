// Hatch lab — renders the same NYC chart under a grid of hatch parameter variants so the
// best-looking encoding can be picked by eye. Dev-only page; not part of any build.
import { csvParse } from 'd3-dsv';
import { createAdaptiveChart } from './src/chart/adaptive-chart.js';

const urlTheme = new URLSearchParams(window.location.search).get('theme');
document.documentElement.setAttribute('data-theme', urlTheme === 'dark' ? 'dark' : 'light');

// The candidates. "current" is what's deployed right now; the rest bracket it in
// spacing (band contrast), line opacity (texture weight), fill opacity (how hard the
// solid "maximally compressed" block reads), and direction.
const VARIANTS = [
  { title: 'A — current (deployed)', opts: {} },
  { title: 'B — sparser, lighter', opts: { hatchSpacing: 12, hatchOpacity: 0.3 } },
  { title: 'C — denser, lighter', opts: { hatchSpacing: 6, hatchOpacity: 0.3 } },
  { title: 'D — sparser, softer fill', opts: { hatchSpacing: 12, hatchOpacity: 0.45, hatchFillOpacity: 0.3 } },
  { title: 'E — heavy texture', opts: { hatchSpacing: 6, hatchOpacity: 0.6, hatchFillOpacity: 0.65 } },
  { title: 'F — "/" direction', opts: { hatchAngle: -1 } },
  { title: 'G — fine grain, low weight', opts: { hatchSpacing: 5, hatchMinPx: 1.5, hatchOpacity: 0.25, hatchFillOpacity: 0.35 } },
  { title: 'H — coarse, soft everything', opts: { hatchSpacing: 16, hatchMinPx: 3, hatchOpacity: 0.35, hatchFillOpacity: 0.25 } },
];

const fmtOpts = (o) =>
  Object.entries({ hatchSpacing: 8, hatchMinPx: 2, hatchOpacity: 0.45, hatchFillOpacity: 0.5, hatchAngle: 1, ...o })
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
