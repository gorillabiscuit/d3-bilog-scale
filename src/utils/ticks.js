// Cull a log scale's ticks to clean, legible marks. A d3 log axis otherwise dumps every 1–9 minor
// tick per decade, which is far too dense: keep only the conventional 1/2/5 mantissas, then drop any
// that would sit closer than `minGapPx` to the previous kept tick so labels never collide.
// Shared by the live embed page (static.js) and the static figure export (generate-figures.mjs).
export function cleanLogTicks(scale, minGapPx = 70) {
  const onesTwosFives = scale.ticks().filter((t) => {
    const m = t / Math.pow(10, Math.floor(Math.log10(t) + 1e-9));
    return [1, 2, 5].some((k) => Math.abs(m - k) < 1e-6);
  });
  const kept = [];
  let lastPx = -Infinity;
  for (const t of onesTwosFives) {
    const px = scale(t);
    if (px - lastPx >= minGapPx) { kept.push(t); lastPx = px; }
  }
  return kept;
}
