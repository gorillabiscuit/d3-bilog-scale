import { scaleLog, scaleLinear } from 'd3-scale';

/**
 * Generate tick values for a mixed-region adaptive scale.
 * Each region uses its native tick algorithm; boundary values are always included.
 *
 * @param {Array<{type: string, domain: [number,number], pixels: number}>} regions
 * @param {number} totalPixels
 * @returns {number[]}
 */
export function generateTicks(regions, totalPixels) {
  const TARGET_PIXELS_PER_TICK = 70;
  const allTicks = new Set();

  for (const region of regions) {
    const count = Math.max(2, Math.round(region.pixels / TARGET_PIXELS_PER_TICK));
    const [lo, hi] = region.domain;

    let ticks;
    if (region.type === 'log') {
      const safeLo = lo <= 0 ? 1e-10 : lo;
      const safeHi = hi <= 0 ? 1e-9 : hi;
      ticks = scaleLog().domain([safeLo, safeHi]).ticks(count);
    } else {
      ticks = scaleLinear().domain([lo, hi]).ticks(count);
    }

    ticks.forEach((t) => allTicks.add(t));
    // Boundary values always present
    allTicks.add(lo);
    allTicks.add(hi);
  }

  return [...allTicks].filter(Number.isFinite).sort((a, b) => a - b);
}
