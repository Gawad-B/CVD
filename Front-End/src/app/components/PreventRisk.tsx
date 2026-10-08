import type { PreventResult } from "../api/types";
import { cn } from "../ui";

const CATEGORY_TEXT = { low: "Low", borderline: "Borderline", intermediate: "Intermediate", high: "High" } as const;
const CATEGORY_COLOR = { low: "#15803d", borderline: "#b45309", intermediate: "#c2410c", high: "#b91c1c" } as const;
const MODEL_TEXT = {
  base: "base equation",
  uacr: "with urine albumin/creatinine",
  hba1c: "with HbA1c",
  full: "with HbA1c and urine albumin/creatinine",
} as const;

/** AHA PREVENT 10-year total CVD risk, or the reason it could not be calculated. */
export function PreventRisk({ prevent, className }: { prevent?: PreventResult; className?: string }) {
  if (!prevent) return null;
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
    </div>
  );
}
