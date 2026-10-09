/** A 0-1 risk as a whole-number percentage. Anything above 0 but under 1% shows as "<1%", never "0%". */
export function formatScore(probability: number): string {
  const pct = probability * 100;
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}
