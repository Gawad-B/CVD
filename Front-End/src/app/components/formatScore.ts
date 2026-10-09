import type { LevelSource } from "../api/types";

/** A 0-1 risk as a whole-number percentage. Anything above 0 but under 1% shows as "<1%", never "0%". */
export function formatScore(probability: number): string {
  const pct = probability * 100;
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

interface LevelInputs {
  probabilityCvd: number;
  levelSource?: LevelSource;
  preventRisk?: number;
  overrideRiskLevel?: string | null;
}

/** The number (or rule) behind the risk badge, so the score shown always explains the level. */
export function levelReason(a: LevelInputs): string {
  if (a.overrideRiskLevel) return "Clinician override";
  if (a.levelSource === "alerts") return "Clinical alerts";
  if (a.levelSource === "prevent" && a.preventRisk !== undefined) return `PREVENT ${formatScore(a.preventRisk)}`;
  return `Model ${formatScore(a.probabilityCvd)}`;
}
