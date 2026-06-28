// App-only utility — NOT part of the chart/scale code that goes to Observable.
// Serialises the live chart SVG (with the current theme's colours inlined and a solid
// background) and downloads it. Wired to the "S" key by the harness in index.js.

// The custom properties the chart's embedded stylesheet (CHART_CSS) reads via var(). They're
// defined on the page per data-theme, so a standalone file must carry their resolved values.
const CHART_VARS = [
  '--dot-fill', '--axis-color', '--axis-text', '--label-color',
  '--tooltip-bg', '--tooltip-border', '--tooltip-text', '--tooltip-text-muted',
  '--ruler-tint', '--chart-surface',
];

export function downloadChartSvg(svgEl, filename = 'chart.svg') {
  if (!svgEl) return;

  const clone = svgEl.cloneNode(true);
  const computed = getComputedStyle(document.documentElement);

  // Inline the theme variables so the var() references in the embedded <style> resolve to the
  // same colours when the file is opened outside the app.
  for (const name of CHART_VARS) {
    const value = computed.getPropertyValue(name).trim();
    if (value) clone.style.setProperty(name, value);
  }

  // Explicit pixel size from the viewBox so it opens at a sensible scale (the on-page SVG is
  // sized to 100% of its container), and drop that container sizing from the clone.
  const vb = (svgEl.getAttribute('viewBox') || '').split(/[ ,]+/).map(Number);
  const [, , vbW, vbH] = vb.length === 4 ? vb : [0, 0, 900, 600];
  clone.setAttribute('width', vbW);
  clone.setAttribute('height', vbH);
  clone.style.removeProperty('width');
  clone.style.removeProperty('height');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // The on-page SVG is transparent over the page background; a saved file needs its own, or
  // light-on-transparent themes render invisibly. A backing rect is the most viewer-compatible.
  const surface = computed.getPropertyValue('--chart-surface').trim() || '#16213e';
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', 0);
  bg.setAttribute('y', 0);
  bg.setAttribute('width', vbW);
  bg.setAttribute('height', vbH);
  bg.setAttribute('fill', surface);
  clone.insertBefore(bg, clone.firstChild);

  const svgText = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const slugify = (s) =>
  (s || 'chart').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chart';

// Press "S" to save the current chart as SVG. getChart() returns the live SVG node; getName()
// returns a base filename (no extension). Plain "S" only — Cmd/Ctrl+S is left to the browser,
// and presses while focused in a form control are ignored.
export function registerSvgSaveShortcut(getChart, getName) {
  window.addEventListener('keydown', (event) => {
    if (event.key !== 's' && event.key !== 'S') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const t = event.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const chart = getChart?.();
    if (!chart) return;
    event.preventDefault();
    downloadChartSvg(chart, `${slugify(getName?.())}.svg`);
  });
}
