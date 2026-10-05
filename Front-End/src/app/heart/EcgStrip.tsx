import { useMemo } from "react";
import type { CSSProperties } from "react";
import { cn } from "../ui";
import { clampBpm, normalizeRisk, type HeartRisk } from "./cardiacCycle";
import { RISK_TONE } from "./riskTone";

/** Beats drawn across one 600-unit scroll cycle of the trace (see `ecgPattern`). */
export const BEATS_PER_CYCLE = 5;

/** Trace amplitude per risk level. Risk is conveyed by amplitude and colour only, never by rhythm. */
const AMPLITUDE: Record<HeartRisk, number> = { low: 1, medium: 0.7, high: 0.42, unknown: 0.7 };

/**
 * Scroll duration (seconds) for one 600px trace cycle. The trace holds N beats per cycle, so for the
 * beat spacing to match the heart (one beat every 60/bpm seconds): duration = N * 60 / bpm.
 */
export function ecgScrollSeconds(_risk: HeartRisk, bpm: number): number {
  return (BEATS_PER_CYCLE * 60) / clampBpm(bpm);
}

/**
 * One regular sinus-like trace (five evenly spaced beats), identical in shape for every risk level;
 * only its amplitude is scaled. Two copies, 600 units each, so the scroll loops seamlessly.
 */
function ecgPattern(risk: HeartRisk, off: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const a = AMPLITUDE[risk];
  const add = (x: number, y: number) => pts.push([off + x, 50 + (y - 50) * a]);
  for (let i = 0; i < BEATS_PER_CYCLE; i++) {
    const x = i * 120;
    add(x, 50);
    add(x + 20, 50); // P wave
    add(x + 26, 44);
    add(x + 32, 50);
    add(x + 40, 50); // QRS
    add(x + 44, 57);
    add(x + 50, 12);
    add(x + 56, 66);
    add(x + 60, 50); // ST segment, T wave
    add(x + 76, 50);
    add(x + 86, 40);
    add(x + 96, 50);
  }
  add(600, 50);
  return pts;
}

export function ecgPath(risk: HeartRisk): string {
  const pts = [...ecgPattern(risk, 0), ...ecgPattern(risk, 600)];
  return "M" + pts.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join(" L");
}


interface EcgStripProps {
  risk: HeartRisk;
  /** Heart rate that drives the heart; the trace scroll is derived from it. */
  bpm: number;
  className?: string;
}

/** Dark ECG strip. Always labelled as an illustration; rhythm is never shown as a finding. */
export function EcgStrip({ risk: riskProp, bpm, className }: EcgStripProps) {
  const risk = normalizeRisk(riskProp);
  const path = useMemo(() => ecgPath(risk), [risk]);
  const color = RISK_TONE[risk].ecg;
  const duration = ecgScrollSeconds(risk, bpm);
  const style = { "--ecg-scroll": `${duration}s` } as CSSProperties;
  return (
    <div
      className={cn("flex items-center gap-[14px] rounded-[16px] bg-[#0b1530] px-[14px] py-[10px]", className)}
      data-testid="ecg-strip"
      data-scroll-seconds={duration.toFixed(3)}
    >
      <style>{`
        @keyframes ecg-scroll { from { transform: translateX(0); } to { transform: translateX(-600px); } }
        .ecg-trace { animation: ecg-scroll var(--ecg-scroll) linear infinite; }
        @media (prefers-reduced-motion: reduce) { .ecg-trace { animation: none; } }
      `}</style>
      <span className="whitespace-nowrap text-[12px] font-semibold text-[#8fa1c4]">ECG · illustration</span>
      <svg
        viewBox="0 0 600 80"
        preserveAspectRatio="none"
        className="block h-14 flex-1 overflow-hidden"
        role="img"
        aria-label="Illustrative ECG trace, not patient data"
      >
        <g className="ecg-trace" style={style}>
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
    </div>
  );
}
