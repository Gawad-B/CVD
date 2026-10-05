export function formatFactorValue(value: number | string): string {
  const number = typeof value === "number" ? value : Number(value);
  if (typeof value === "number" || (value !== "" && Number.isFinite(number))) {
    return String(Math.round(number * 100) / 100);
  }
  return String(value);
}
