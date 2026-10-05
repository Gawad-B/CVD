import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeVariant =
  | "low"
  | "medium"
  | "high"
  | "pending"
  | "unknown"
  | "doctor"
  | "clinician"
  | "admin"
  | "auditor"
  | "success"
  | "failure"
  | "denied"
  | "neutral";

/** Variant -> [background, text] hex pairs from the design READMEs. */
export const BADGE_COLORS: Record<BadgeVariant, readonly [string, string]> = {
  low: ["#dcfce7", "#15803d"],
  medium: ["#fef3c7", "#b45309"],
  high: ["#fee2e2", "#b91c1c"],
  pending: ["#e8edf6", "#4b5568"],
  unknown: ["#e8edf6", "#4b5568"],
  doctor: ["#e6edff", "#1446d1"],
  clinician: ["#dcfce7", "#15803d"],
  admin: ["#e8edf6", "#323b4c"],
  auditor: ["#fef3c7", "#b45309"],
  success: ["#dcfce7", "#15803d"],
  failure: ["#fee2e2", "#b91c1c"],
  denied: ["#fee2e2", "#b91c1c"],
  neutral: ["#e8edf6", "#4b5568"],
};

const DEFAULT_LABELS: Partial<Record<BadgeVariant, string>> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
  pending: "Not assessed",
  unknown: "Unknown risk",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant };

export function Badge({ variant = "neutral", className, style, children, ...props }: BadgeProps) {
  const [bg, fg] = BADGE_COLORS[variant];
  return (
    <span
      data-variant={variant}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold leading-none",
        className
      )}
      style={{ backgroundColor: bg, color: fg, ...style }}
      {...props}
    >
      {children ?? DEFAULT_LABELS[variant] ?? variant}
    </span>
  );
}

export function riskVariant(level: string | null | undefined): BadgeVariant {
  return level === "low" || level === "medium" || level === "high" || level === "unknown" ? level : "pending";
}
