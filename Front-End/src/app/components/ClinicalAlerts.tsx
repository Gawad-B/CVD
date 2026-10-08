import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { ClinicalAlert, RiskLevel } from "../api/types";
import { cn } from "../ui";

const TONE = {
  critical: { icon: OctagonAlert, box: "bg-[#fee2e2] text-[#991b1b]", label: "Critical" },
  warning: { icon: AlertTriangle, box: "bg-[#fef3c7] text-[#92400e]", label: "Warning" },
  info: { icon: Info, box: "bg-[#e8eefb] text-[#1e3a8a]", label: "Note" },
} as const;

const ORDER = { critical: 0, warning: 1, info: 2 } as const;

/** Guideline alerts on the raw readings, plus a note when they raised the model's risk level. */
export function ClinicalAlerts({
  alerts,
  baseRiskLevel,
  riskSource,
  riskLevel,
  className,
}: {
  alerts: ClinicalAlert[];
  /** Level before the alerts were applied. */
  baseRiskLevel?: RiskLevel;
  riskSource?: "prevent" | "model";
  riskLevel: RiskLevel;
  className?: string;
}) {
  if (alerts.length === 0) return null;
  const raised = baseRiskLevel !== undefined && baseRiskLevel !== riskLevel;
  const source = riskSource === "prevent" ? "PREVENT" : "model";
  const sorted = [...alerts].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {raised && (
        <p role="note" className="rounded-[12px] bg-[#fee2e2] px-3.5 py-2.5 text-[13px] font-semibold text-[#991b1b]">
          {`Risk raised from ${baseRiskLevel} (${source}) to ${riskLevel} by clinical alerts. The scores themselves are unchanged.`}
        </p>
      )}
      <ul aria-label="Clinical alerts" className="flex flex-col gap-2">
        {sorted.map((alert) => {
          const tone = TONE[alert.severity];
          const Icon = tone.icon;
          return (
            <li key={alert.code || alert.title} className={cn("flex items-start gap-2.5 rounded-[12px] px-3.5 py-2.5", tone.box)}>
              <Icon className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
              <div className="text-[13px] leading-relaxed">
                <span className="sr-only">{`${tone.label}: `}</span>
                <span className="font-semibold">{alert.title}</span>
                {alert.detail && <span>{` — ${alert.detail}`}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] text-[#5b6b85]">Guideline thresholds checked on the entered readings, independent of the model.</p>
    </div>
  );
}
