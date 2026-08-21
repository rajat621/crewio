// Compact currency formatting for the Finance page's stat cards/summary
// (e.g. "45 k", "1 L") - mirrors the reference design's abbreviation style
// rather than full localized currency strings, since these are dashboard
// headline numbers, not ledger entries.
export function formatCompactAmount(value) {
  const num = Number(value) || 0;
  const abs = Math.abs(num);

  if (abs >= 10000000) return `${trimDecimal(num / 10000000)} Cr`;
  if (abs >= 100000) return `${trimDecimal(num / 100000)} L`;
  if (abs >= 1000) return `${trimDecimal(num / 1000)} k`;
  return trimDecimal(num);
}

function trimDecimal(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatAmount(value) {
  const num = Number(value) || 0;
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
