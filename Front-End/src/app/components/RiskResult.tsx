import type { RiskLevel, ScoreType } from "../api/types";
import { RISK_TONE } from "../heart/riskTone";
import { cn } from "../ui";
import { InfoTip } from "../ui/InfoTip";
import { formatScore } from "./formatScore";

/** What each level means for the clinician, in plain words. */
export const LEVEL_MEANING: Record<RiskLevel, string> = {
  low: "No warning signs. Keep healthy habits and routine yearly check-ups.",
  medium: "Some risk factors. Plan a follow-up within 3 months and manage blood pressure, cholesterol and sugar.",
  high: "Needs attention. Prioritise clinician review and start or adjust treatment.",
  unknown: "Level not recognised. Review this assessment manually.",
};

const LEVELS = ["low", "medium", "high"] as const;
const LEVEL_NAME = { low: "Low", medium: "Medium", high: "High" } as const;

/** Death-risk scale: the ESC SCORE bands (<1 % low, 1-5 % medium, >=5 % high), drawn up to 10 %. */
const SCALE_MAX = 0.1;
const ZONES = [
  { from: 0, to: 0.01, color: RISK_TONE.low.color },
  { from: 0.01, to: 0.05, color: RISK_TONE.medium.color },
  { from: 0.05, to: SCALE_MAX, color: RISK_TONE.high.color },
] as const;

const ORDER = { low: 0, medium: 1, high: 2, unknown: -1 } as const;

/** Level the death percentage gives on its own (ESC SCORE bands). */
export function deathBand(probability: number): "low" | "medium" | "high" {
  return probability >= 0.05 ? "high" : probability >= 0.01 ? "medium" : "low";
}

function Legend({ items }: { items: Array<[RiskLevel, string]> }) {
  return (
    <ul aria-label="What the levels mean" className="mt-3 flex flex-col gap-1 rounded-[12px] bg-white/70 px-3 py-2.5 text-[12.5px] text-[#33405a]">
      {items.map(([level, text]) => (
        <li key={level} className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RISK_TONE[level].color }} />
          {text}
        </li>
      ))}
    </ul>
  );
}

/** "About 3 in 100" wording, which is easier to grasp than a bare percentage. */
export function inHundred(probability: number): string {
  const n = Math.round(probability * 100);
  if (probability > 0 && n < 1) return "Fewer than 1 in 100";
  return `About ${n} in 100`;
}

/** Three-segment meter: the active level is filled in its colour, the others stay grey. */
export function LevelMeter({ level, className }: { level: RiskLevel; className?: string }) {
  return (
    <div role="img" aria-label={`Risk level: ${level}`} className={cn("grid grid-cols-3 gap-1.5", className)}>
      {LEVELS.map((l) => {
        const active = l === level;
        return (
          <div key={l} className="flex flex-col items-center gap-1">
            <span className="h-2.5 w-full rounded-full" style={{ background: active ? RISK_TONE[l].color : "#e2e8f2" }} />
            <span
              aria-hidden
              className={cn("text-[11.5px]", active ? "font-bold" : "text-[#8fa1c4]")}
              style={active ? { color: RISK_TONE[l].color } : undefined}
            >
              {LEVEL_NAME[l]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Coloured 0-10 % bar with a marker at the patient's 10-year death risk. */
export function DeathScale({ probability, className }: { probability: number; className?: string }) {
  const position = Math.min(Math.max(probability, 0), SCALE_MAX) / SCALE_MAX;
  return (
    <div className={cn("pt-1", className)} aria-hidden>
      <div className="relative">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          {ZONES.map((z) => (
            <span key={z.from} style={{ width: `${((z.to - z.from) / SCALE_MAX) * 100}%`, background: z.color, opacity: 0.85 }} />
          ))}
        </div>
        <span
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[#0b1530] shadow"
          style={{ left: `${position * 100}%` }}
        />
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-[#5b6b85]">
        <span className="absolute left-0">0%</span>
        <span className="absolute -translate-x-1/2" style={{ left: "10%" }}>1%</span>
        <span className="absolute -translate-x-1/2" style={{ left: "50%" }}>5%</span>
        <span className="absolute right-0">10%+</span>
      </div>
    </div>
  );
}

interface Props {
  /** Final level shown to the clinician (after PREVENT, alerts and any override). */
  level: RiskLevel;
  scoreType?: ScoreType;
  /** Model output, 0-1. Only shown for the 10-year death model. */
  probability: number;
  className?: string;
}

/**
 * The result, shown the way each model is meant to be read:
 * the screening model as Low / Medium / High, the death model as a 10-year percentage.
 */
export function RiskResult({ level, scoreType, probability, className }: Props) {
  const tone = RISK_TONE[level];
  const death = scoreType === "death_10y";
  return (
    <div className={cn("flex flex-col gap-3", className)} data-testid="risk-result">
      {death ? (
        <div>
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#5b6b85]">
            10-year risk of dying from heart disease or stroke
            <InfoTip text="From the 10-year death model, trained on 19,605 adults followed for 10+ years. Under 1% is low, 1–5% medium, 5% or more high (European SCORE bands). Clinical alerts and AHA PREVENT can raise the level." />
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-[40px] font-bold leading-none tracking-[-0.03em] tabular-nums" style={{ color: tone.color }}>
              {formatScore(probability)}
            </span>
            <span className="text-[13px] text-[#33405a]">{`${inHundred(probability)} people like this patient`}</span>
          </p>
          <DeathScale probability={probability} className="mt-3" />
          <Legend
            items={[
              ["low", "Under 1% = Low risk"],
              ["medium", "1% to 5% = Medium risk"],
              ["high", "5% or more = High risk"],
            ]}
          />
          {ORDER[level] > ORDER[deathBand(probability)] && (
            <p className="mt-2 rounded-[12px] bg-[#fef3c7] px-3 py-2 text-[12.5px] leading-relaxed text-[#92400e]">
              {`The percentage alone is ${LEVEL_NAME[deathBand(probability)]}, but the level is ${LEVEL_NAME[level as "medium" | "high"]} because of the clinical alerts or the AHA PREVENT result (dangerous readings count even when the 10-year death risk is small).`}
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#5b6b85]">
            Heart disease risk
            <InfoTip text="From the screening model (NHANES 2021–2023), combined with the AHA PREVENT guideline and clinical alerts. The higher signal wins." />
          </p>
          <p className="mt-1 text-[32px] font-bold leading-none tracking-[-0.03em]" style={{ color: tone.color }}>
            {level === "unknown" ? "Unknown risk" : `${LEVEL_NAME[level]} risk`}
          </p>
          <LevelMeter level={level} className="mt-3" />
          <Legend
            items={[
              ["low", "Low = no warning signs"],
              ["medium", "Medium = some risk factors, follow up within 3 months"],
              ["high", "High = needs prompt clinician review"],
            ]}
          />
        </div>
      )}
      <p className="text-[13.5px] leading-relaxed text-[#33405a]">
        {death && level !== "unknown" && (
          <span className="font-semibold" style={{ color: tone.color }}>{`${LEVEL_NAME[level]} risk. `}</span>
        )}
        {LEVEL_MEANING[level]}
      </p>
    </div>
  );
}

/** One short line for tables and lists explaining the badge next to it. */
export function riskSummary(a: {
  scoreType?: ScoreType;
  probabilityCvd: number;
  levelSource?: string;
  overrideRiskLevel?: string | null;
}): string {
  if (a.overrideRiskLevel) return "Set by clinician";
  if (a.scoreType === "death_10y") return `${formatScore(a.probabilityCvd)} death risk in 10 yrs`;
  if (a.levelSource === "alerts") return "Raised by clinical alerts";
  if (a.levelSource === "prevent") return "From AHA PREVENT";
  return "From screening model";
}
