import { format } from 'd3-format';

export function currencyFmt(v) {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${+(v / 1e12).toPrecision(3)}T`;
  if (abs >= 1e9)  return `$${+(v / 1e9).toPrecision(3)}B`;
  if (abs >= 1e6)  return `$${+(v / 1e6).toPrecision(3)}M`;
  if (abs >= 1e3)  return `$${+(v / 1e3).toPrecision(3)}k`;
  return `$${+v.toPrecision(3)}`;
}

export function makeFmt(specifier) {
  return specifier === 'currency' ? currencyFmt : format(specifier);
}

export const fmtMult = n => {
  if (n >= 1000) return makeFmt('~s')(n);
  if (n >= 10)   return Math.round(n).toString();
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
};

// Tick count that scales with available pixel width, budgeting ~150px per label —
// the caller's job in the d3 idiom (ticks(count) on a scale means "about this many",
// with density-vs-width tradeoffs decided by whoever owns the axis, not the scale).
export const tickCountForWidth = innerW => Math.max(3, Math.round(innerW / 150));
