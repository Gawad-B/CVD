import { BPM_MAX, BPM_MIN, normalizeRisk, type HeartRisk } from "./cardiacCycle";

export { normalizeRisk };

export interface RiskTone {
  /** Risk accent colour. */
  color: string;
  /** ECG trace colour (on the dark strip). */
  ecg: string;
  /** Illustrative heart rate used only when no measured rate exists. */
  bpm: number;
  /** Plain-language state sentence. */
  state: string;
}

/** Design README risk tone table. State text is risk-level wording only: no rhythm/beat claims. */
export const RISK_TONE: Record<HeartRisk, RiskTone> = {
  low: {
    color: "#16a34a",
    ecg: "#4ade80",
    bpm: 68,
    state: "Low estimated risk. Routine follow-up in 12 months.",
  },
  medium: {
    color: "#d97706",
    ecg: "#fbbf24",
    bpm: 91,
    state: "Moderate estimated risk. Review within 3 months.",
  },
  high: {
    color: "#dc2626",
    ecg: "#f87171",
    bpm: 118,
    state: "High estimated risk. Prompt clinical review recommended.",
  },
  unknown: {
    color: "#64748b",
    ecg: "#94a3b8",
    bpm: 70,
    state: "Risk level unavailable for this assessment.",
  },
};

export interface HeartRateDisplay {
  bpm: number;
  /** True only when `bpm` is a recorded patient measurement. */
  measured: boolean;
}

/**
 * The rate to animate (and, when measured, to show). A recorded heart rate wins; otherwise the
 * per-risk illustrative rate is used and `measured` is false, so callers must not print it as data.
 */
export function heartRateDisplay(
  heartRateBpm: number | null | undefined,
  risk: HeartRisk,
): HeartRateDisplay {
  if (
    typeof heartRateBpm === "number" &&
    Number.isFinite(heartRateBpm) &&
    heartRateBpm >= BPM_MIN &&
    heartRateBpm <= BPM_MAX
  ) {
    return { bpm: heartRateBpm, measured: true };
  }
  return { bpm: RISK_TONE[normalizeRisk(risk)].bpm, measured: false };
}
