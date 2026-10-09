import { Suspense, type CSSProperties } from "react";
import { Activity } from "lucide-react";
import { EcgStrip, HeartCredit, LazyHeart3D, RISK_TONE, heartRateDisplay } from "../../heart";
import { RISK_LABEL, formatDate, isOverridden } from "./logic";
import type { RiskAssessment } from "../../api/types";
import { scoreCaveat } from "../clinicalConstants";
import { formatScore } from "../formatScore";
import { LevelMeter } from "../RiskResult";

interface Props {
  assessment: RiskAssessment;
  code: string;
  meta: string;
}

function HeartFallback() {
  return (
    <div
      role="status"
      className="flex h-[420px] w-full max-w-[520px] items-center justify-center text-[13px] text-[#5b6b85]"
    >
      Loading 3D heart…
    </div>
  );
}

/** Heart, glow, ring, result card and ECG strip for one assessment, driven by the effective risk. */
export function HeartStage({ assessment, code, meta }: Props) {
  const risk = assessment.effectiveRiskLevel;
  const tone = RISK_TONE[risk];
  const { bpm, measured } = heartRateDisplay(assessment.heartRate, risk);
  const period = 60 / bpm;
  const overridden = isOverridden(assessment);
  const levelOverridden = assessment.overrideRiskLevel != null;
  const anim = { "--beat": `${period.toFixed(3)}s` } as CSSProperties;

  return (
    <section
      aria-label="Heart stage"
      className="relative flex min-h-[540px] flex-col overflow-hidden rounded-[26px] p-[22px] shadow-[0_14px_40px_-26px_rgba(31,60,120,.4)]"
      style={{ background: "radial-gradient(90% 80% at 50% 45%, #fff, #eef2f9 70%, #e6ecf6)", ...anim }}
    >
      <style>{`
        @keyframes stage-glow { 0%,100% { transform: scale(1); } 14% { transform: scale(1.06); } 30% { transform: scale(1); } }
        @keyframes stage-ring { from { transform: scale(.8); opacity: .5; } to { transform: scale(1.25); opacity: 0; } }
        .stage-glow { animation: stage-glow var(--beat) ease-in-out infinite; }
        .stage-ring { animation: stage-ring var(--beat) ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .stage-glow, .stage-ring { animation: none; } .stage-ring { opacity: 0; } }
      `}</style>

      <div className="relative z-[2] flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-[#5b6b85]">{code}</div>
          <div className="mt-0.5 text-[24px] font-bold tracking-[-0.02em] text-[#0b1530]">{assessment.patientName}</div>
          {meta && <div className="mt-0.5 text-[13px] text-[#5b6b85]">{meta}</div>}
        </div>
        {measured && (
          <div className="flex items-center gap-2.5 rounded-full bg-white px-4 py-2.5 shadow-[0_6px_18px_rgba(31,60,120,.08)]">
            <Activity className="h-[18px] w-[18px]" style={{ color: tone.color }} aria-hidden />
            <span className="text-[14px] font-bold tabular-nums text-[#0b1530]">
              {`${Math.round(bpm)} bpm · measured ${formatDate(assessment.createdAt)}`}
            </span>
          </div>
        )}
      </div>

      <div className="relative grid min-h-[340px] flex-1 place-items-center">
        <div
          aria-hidden
          className="stage-ring absolute h-[330px] w-[330px] rounded-full border-2 opacity-0"
          style={{ borderColor: tone.color }}
        />
        <div
          aria-hidden
          className="stage-glow absolute h-[360px] w-[360px] rounded-full transition-[background] duration-[600ms]"
          style={{ background: `radial-gradient(closest-side, ${tone.color}33, transparent)` }}
        />
        <div className="flex w-full justify-center">
          <div className="h-[420px] w-full max-w-[520px]">
            <Suspense fallback={<HeartFallback />}>
              <LazyHeart3D risk={risk} bpm={bpm} measured={measured} className="h-[420px] w-full" />
            </Suspense>
          </div>
        </div>

        <div
          className="relative z-[3] mt-3 w-full max-w-[320px] rounded-[18px] border border-white bg-white/70 p-3.5 shadow-[0_14px_34px_-14px_rgba(31,60,120,.35)] backdrop-blur-[14px] sm:absolute sm:bottom-6 sm:right-[clamp(0px,4%,40px)] sm:mt-0 sm:w-[220px]"
          data-testid="result-card"
        >
          <div className="flex items-center gap-2 text-[12.5px] font-bold" style={{ color: tone.color }}>
            <span aria-hidden className="h-[9px] w-[9px] rounded-full" style={{ background: tone.color }} />
            {RISK_LABEL[risk]}
          </div>
          {assessment.scoreType === "death_10y" ? (
            <div className="mt-2">
              <span className="text-[30px] font-bold tracking-[-0.02em] tabular-nums" style={{ color: tone.color }}>
                {formatScore(assessment.probabilityCvd)}
              </span>
              <span className="block text-[12px] leading-snug text-[#5b6b85]">risk of dying from heart disease or stroke in 10 years</span>
            </div>
          ) : (
            <LevelMeter level={risk} className="mt-2.5" />
          )}
          <p className="mt-1.5 text-[12.5px] leading-[1.45] text-[#33405a]">{tone.state}</p>
          {overridden && (
            <p className="mt-2 border-t border-[#e6ebf4] pt-2 text-[12px] leading-[1.4] text-[#33405a]">
              {`${levelOverridden ? "Overridden" : "Recommendation overridden"} by ${assessment.overriddenByUsername ?? "a clinician"}${
                assessment.overriddenAt ? ` · ${formatDate(assessment.overriddenAt)}` : ""
              }${levelOverridden ? `: ${RISK_LABEL[risk]}` : ""}`}
              {levelOverridden && (
                <>
                  <br />
                  <span className="text-[#5b6b85]">{`Model's original level: ${RISK_LABEL[assessment.riskLevel]}`}</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="relative z-[2] mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-[11.5px] text-[#5b6b85]">
          {measured ? null : <span className="font-semibold">Illustration of risk level — not patient data</span>}
          {measured ? null : <br />}
          {`Decision support only. ${scoreCaveat(assessment.explanation?.scoreCaveat)}`}
        </p>
        <HeartCredit />
      </div>
      <EcgStrip risk={risk} bpm={bpm} className="relative z-[2]" />
    </section>
  );
}
