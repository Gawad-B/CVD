import type { ClinicalAlert, PreventResult } from "../api/types";
import { cn } from "../ui";

const CATEGORY_TEXT = { low: "Low", borderline: "Borderline", intermediate: "Intermediate", high: "High" } as const;
const CATEGORY_COLOR = { low: "#15803d", borderline: "#b45309", intermediate: "#c2410c", high: "#b91c1c" } as const;
const MODEL_TEXT = {
  base: "base equation",
  uacr: "with urine albumin/creatinine",
  hba1c: "with HbA1c",
  full: "with HbA1c and urine albumin/creatinine",
} as const;

// Major risk factors among the clinical alerts (mirrors Back-End/clinical_alerts.py _MAJOR).
const MAJOR_RISK_FACTORS = new Set(["bp_crisis", "bp_stage2", "cholesterol_high", "hba1c_diabetes", "hdl_low", "smoker"]);

/** AHA PREVENT 10-year total CVD risk, or the reason it could not be calculated. */
export function PreventRisk({
  prevent,
  alerts = [],
  className,
}: {
  prevent?: PreventResult;
  /** Clinical alerts, used for the risk-factor summary when no equation applies to the patient's age. */
  alerts?: ClinicalAlert[];
  className?: string;
}) {
  if (!prevent) return null;
  if (prevent.ageOutOfRange) {
    const major = alerts.filter((a) => MAJOR_RISK_FACTORS.has(a.code));
    return (
      <div className={cn("text-[13px] text-[#5b6b85]", className)}>
        <p>
          <span className="font-semibold text-[#33405a]">10-year CVD risk: no validated equation for this age. </span>
          AHA PREVENT covers ages 30–79; outside that range a 10-year number would not be reliable, so the risk factors are
          listed instead.
        </p>
        <p className="mt-1.5 font-semibold text-[#33405a]">
          {major.length === 0
            ? "No major risk factors flagged."
            : `${major.length} major risk factor${major.length === 1 ? "" : "s"}: ${major.map((a) => a.title).join(", ")}.`}
        </p>
      </div>
    );
  }
  if (!prevent.available || prevent.risk === undefined) {
    return (
      <p className={cn("text-[13px] text-[#5b6b85]", className)}>
        <span className="font-semibold text-[#33405a]">10-year CVD risk (AHA PREVENT): not available. </span>
        {prevent.reason ?? "Some required inputs are missing."} The risk level uses the ML model instead.
      </p>
    );
  }
  const category = prevent.category;
  return (
    <div className={cn("text-[13px] text-[#5b6b85]", className)}>
      <p className="text-[12px] font-semibold text-[#5b6b85]">10-year CVD risk (AHA PREVENT)</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[24px] font-bold tabular-nums text-[#0b1530]">{`${(prevent.risk * 100).toFixed(1)}%`}</span>
        {category && (
          <span className="font-semibold" style={{ color: CATEGORY_COLOR[category] }}>
            {CATEGORY_TEXT[category]}
          </span>
        )}
      </p>
      <p className="mt-0.5 text-[12px]">
        {[prevent.model && MODEL_TEXT[prevent.model], prevent.egfr !== undefined && `eGFR ${prevent.egfr}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {prevent.risk30 !== undefined && (
        <p className="mt-2 text-[13px]">
          <span className="font-semibold text-[#33405a]">{`30-year CVD risk: ${(prevent.risk30 * 100).toFixed(1)}%`}</span>
          {" · long-term view for ages 30–59, where 10-year risk is low for most people"}
        </p>
      )}
    </div>
  );
}
