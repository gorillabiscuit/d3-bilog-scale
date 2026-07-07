// Public library entry point — the npm package's "main". Distinct from src/index.js, which
// is the dev-harness app (dataset selector, DOM wiring), not part of the published API.

export { scaleAdaptive } from './scale/adaptive-scale.js';
export { detectBreakpoints } from './scale/breakpoints.js';
export { windowQuantile } from './scale/window.js';
export { detectScaleType } from './scale/detect.js';

export { createAdaptiveChart } from './chart/adaptive-chart.js';
export { createChart, MARGIN, CHART_CSS } from './chart/base-chart.js';

export { currencyFmt, makeFmt, fmtMult, tickCountForWidth } from './utils/format.js';
