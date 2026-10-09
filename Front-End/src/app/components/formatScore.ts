/**
 * Model score (0-1) as a percentage. Below 1% two decimals are kept so small but real risks
 * (e.g. 0.29% 10-year CVD death) never round down to a misleading "0%".
 */
export function formatScore(probability: number): string {
  const pct = probability * 100;
  return `${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%`;
}
