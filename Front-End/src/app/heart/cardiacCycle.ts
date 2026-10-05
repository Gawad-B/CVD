/** Pure maths for the 3D heart, ported from the design handoff `heart3d.js`. */

export type HeartRisk = "low" | "medium" | "high" | "unknown";

/** Smoothstep of x between edges a and b, clamped to 0..1. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * One cardiac cycle, p in 0..1 -> contraction 0..1: small atrial kick, fast ventricular
 * systole, slower relaxation, diastolic rest. Multiply by the risk's `depth`.
 */
export function cardiacCycle(p: number): number {
  return (
    0.18 * (smoothstep(0, 0.06, p) - smoothstep(0.08, 0.16, p)) +
    smoothstep(0.14, 0.26, p) -
    smoothstep(0.34, 0.58, p)
  );
}

export interface RiskParams {
  /** Contraction strength multiplier. */
  depth: number;
  /** How far material colours are lerped toward `target` (0..1). */
  tint: number;
  /** Tint target colour (0xRRGGBB). */
  target: number;
  /** Posture droop (scene units). */
  droop: number;
  /** Idle spin, rad/s. */
  spin: number;
}

/**
 * Risk is conveyed by tint, droop, depth and spin only. The beat is always regular: the heart never
 * depicts rhythm (no jitter, no ectopic beats), because rhythm is not model output.
 */
const PARAMS: Record<HeartRisk, RiskParams> = {
  low: { depth: 1, tint: 0, target: 0xffffff, droop: 0, spin: 0.22 },
  medium: { depth: 0.6, tint: 0.55, target: 0x5a2622, droop: 0.03, spin: 0.16 },
  high: { depth: 0.3, tint: 0.78, target: 0xa9a4b8, droop: 0.08, spin: 0.1 },
  unknown: { depth: 0.8, tint: 0.6, target: 0x9aa3b5, droop: 0, spin: 0.16 },
};

/** Coerce any value to a known risk level; unrecognised values are "unknown" (neutral grey), not "low". */
export function normalizeRisk(risk: unknown): HeartRisk {
  return risk === "low" || risk === "medium" || risk === "high" ? risk : "unknown";
}

export function riskParams(risk: HeartRisk): RiskParams {
  return PARAMS[normalizeRisk(risk)];
}

export const BPM_MIN = 30;
export const BPM_MAX = 220;

/** Clamp to the plausible 30-220 range; non-finite values become the minimum-safe 60. */
export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return 60;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, bpm));
}

/** Seconds per beat for a heart rate in bpm. */
export function beatPeriod(bpm: number): number {
  return 60 / bpm;
}
