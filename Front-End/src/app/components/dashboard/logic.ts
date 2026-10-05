import type { FactorContribution, RiskAssessment } from "../../api/types";
import { formatFactorValue } from "../formatFactorValue";

export type Inputs = Record<string, number | string | null> | undefined;

export function numericInput(inputs: Inputs, key: string): number | null {
  const raw = inputs?.[key];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export interface Vital {
  key: string;
  label: string;
  unit: string;
  value: string;
  abnormal: boolean;
  /** Screen-reader text for an abnormal value (colour alone is not enough). */
  flag?: string;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** Latest-encounter vitals from the assessment's raw NHANES inputs; thresholds from the design README. */
export function buildVitals(inputs: Inputs): Vital[] {
  const sys = numericInput(inputs, "BPXOSY1");
  const dia = numericInput(inputs, "BPXODI1");
  const chol = numericInput(inputs, "LBXTC");
  const hdl = numericInput(inputs, "LBDHDD");
  const bmi = numericInput(inputs, "BMXBMI");
  return [
    {
      key: "bp",
      label: "Blood pressure",
      unit: "mmHg",
      value: sys == null ? "—" : `${fmt(sys)}/${dia == null ? "—" : fmt(dia)}`,
      abnormal: sys != null && sys >= 140,
      flag: "above threshold",
    },
    { key: "chol", label: "Cholesterol", unit: "mg/dL", value: chol == null ? "—" : fmt(chol), abnormal: chol != null && chol >= 240, flag: "above threshold" },
    { key: "hdl", label: "HDL", unit: "mg/dL", value: hdl == null ? "—" : fmt(hdl), abnormal: hdl != null && hdl < 40, flag: "below threshold" },
    { key: "bmi", label: "BMI", unit: "kg/m²", value: bmi == null ? "—" : fmt(bmi), abnormal: bmi != null && bmi >= 30, flag: "above threshold" },
  ];
}

export function sexLabel(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "f" || s === "female" || s === "2" || s === "2.0") return "Female";
  if (s === "m" || s === "male" || s === "1" || s === "1.0") return "Male";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Female, 66" from the server-provided sex/age, falling back to the assessment's NHANES inputs. */
export function patientMeta(assessment: RiskAssessment): string {
  const sex = sexLabel(assessment.patientSex) ?? sexLabel(assessment.inputs?.RIAGENDR);
  const age = assessment.patientAge ?? numericInput(assessment.inputs, "RIDAGEYR");
  return [sex, age == null ? null : String(Math.round(age))].filter(Boolean).join(", ");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export interface FactorRow {
  feature: string;
  label: string;
  /** Bar width, 0..100, relative to the largest |delta|. */
  pct: number;
  color: string;
  pointsText: string;
  sentence: string;
}

/** README thresholds on the relative %: >=60 red, >=35 amber, else blue. */
export function factorColor(pct: number): string {
  return pct >= 60 ? "#dc2626" : pct >= 35 ? "#d97706" : "#1f5eff";
}

export function buildFactorRows(contributions: FactorContribution[] | undefined): FactorRow[] {
  const items = contributions ?? [];
  const max = items.reduce((m, c) => Math.max(m, Math.abs(c.delta)), 0);
  return items.map((c) => {
    const pct = max > 0 ? (Math.abs(c.delta) / max) * 100 : 0;
    const points = Math.abs(c.delta * 100).toFixed(1);
    return {
      feature: c.feature,
      label: c.label,
      pct,
      color: factorColor(pct),
      pointsText: `${c.delta > 0 ? "+" : c.delta < 0 ? "−" : ""}${points} pp`,
      sentence:
        c.delta === 0
          ? `${c.label}: ${formatFactorValue(c.value)} (typical: ${formatFactorValue(c.reference)}) — no change in the model estimate versus the typical value`
          : `${c.label}: ${formatFactorValue(c.value)} (typical: ${formatFactorValue(c.reference)}) — model estimate ${points} percentage points ${c.delta > 0 ? "higher" : "lower"} than with the typical value`,
    };
  });
}

export function isOverridden(a: RiskAssessment): boolean {
  return Boolean(a.overrideRiskLevel || a.overrideRecommendation);
}

/** Level overridden but the recommendation text is still the model's (written for the model's level). */
export function recommendationMismatch(a: RiskAssessment): boolean {
  return Boolean(a.overrideRiskLevel && a.overrideRiskLevel !== a.riskLevel && !a.overrideRecommendation);
}

export const RISK_LABEL = { low: "Low risk", medium: "Medium risk", high: "High risk", unknown: "Unknown risk" } as const;

export function matchesQuery(name: string, code: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
}
