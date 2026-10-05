import { lazy } from "react";

export { smoothstep, cardiacCycle, riskParams, beatPeriod, normalizeRisk, clampBpm } from "./cardiacCycle";
export type { HeartRisk, RiskParams } from "./cardiacCycle";
export { RISK_TONE, heartRateDisplay } from "./riskTone";
export type { RiskTone, HeartRateDisplay } from "./riskTone";
export { EcgStrip, ecgScrollSeconds, BEATS_PER_CYCLE } from "./EcgStrip";
export { HeartCredit } from "./HeartCredit";
export type { Heart3DProps } from "./Heart3D";

/**
 * Lazy-loaded 3D heart: three.js lives in its own chunk, fetched only when this renders.
 * Wrap in <Suspense>. Never import ./Heart3D statically from app code.
 */
export const LazyHeart3D = lazy(() => import("./Heart3D"));
