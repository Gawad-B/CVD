import type { RiskAssessmentRequest } from "../api/types";
import { ACTIVITY_UNIT_OPTIONS, EDUCATION_OPTIONS, INPUT_RANGES, RACE_OPTIONS } from "./clinicalConstants";
import { MAX_PATIENT_AGE, MIN_PATIENT_AGE } from "./dateOfBirth";

export type FormValues = Record<string, string>;
export type FormErrors = Record<string, string>;

export const HEART_RATE_MIN = 30;
export const HEART_RATE_MAX = 220;

interface NumberField {
  kind: "number";
  name: string;
  label: string;
}
interface SelectField {
  kind: "select";
  name: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}
export type AssessmentField = NumberField | SelectField;

const NUM = (name: string, label: string): NumberField => ({ kind: "number", name, label });

const YES_NO_OPTIONS = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
] as const;

export const DIABETIC_OPTIONS = [
  { value: "no", label: "No" },
  { value: "borderline", label: "Borderline" },
  { value: "yes", label: "Yes" },
] as const;

/**
 * Required inputs: every model input in the notebook's top-20 feature importance
 * (Back-End/model/feature_importance.png), directly or through an engineered feature
 * (hba1c_age, bmi_age, sbp_age, tc_hdl_ratio, waist_bmi), plus diastolic BP and smoker status
 * (clinically expected). Age comes from the date of birth.
 */
export const REQUIRED_FIELDS: readonly AssessmentField[] = [
  NUM("bmi", "BMI (kg/m²)"),
  NUM("waistCm", "Waist (cm)"),
  NUM("systolicBp", "Systolic BP (mmHg)"),
  NUM("diastolicBp", "Diastolic BP (mmHg)"),
  { kind: "select", name: "highBp", label: "History of high BP", options: YES_NO_OPTIONS },
  { kind: "select", name: "bpMed", label: "On BP medication", options: YES_NO_OPTIONS },
  NUM("totalCholesterol", "Total cholesterol (mg/dL)"),
  NUM("hdl", "HDL (mg/dL)"),
  NUM("hba1cPercent", "HbA1c (%)"),
  NUM("hsCrp", "hs-CRP (mg/L)"),
  NUM("wbc", "WBC (10³/µL)"),
  NUM("hemoglobin", "Hemoglobin (g/dL)"),
  NUM("platelets", "Platelets (10³/µL)"),
  NUM("rdw", "RDW (%)"),
  NUM("incomeRatio", "Income ratio (INDFMPIR)"),
  { kind: "select", name: "smoker", label: "Smoker", options: YES_NO_OPTIONS },
];

/** Inputs outside the top-20 importance; all optional, blank means "not recorded" (the API imputes and reports it). */
export const MORE_FIELDS: readonly AssessmentField[] = [
  { kind: "select", name: "diabetic", label: "Diabetic", options: DIABETIC_OPTIONS },
  { kind: "select", name: "highChol", label: "History of high cholesterol", options: YES_NO_OPTIONS },
  { kind: "select", name: "cholMed", label: "On cholesterol medication", options: YES_NO_OPTIONS },
  NUM("sodium", "Sodium (mmol/L)"),
  NUM("vigorousActivityMinutes", "Vigorous activity sessions per unit"),
  NUM("moderateActivityMinutes", "Moderate activity sessions per unit"),
  { kind: "select", name: "moderateActivityUnit", label: "Activity frequency unit (PAD790U)", options: ACTIVITY_UNIT_OPTIONS },
  NUM("sedentaryMinutes", "Moderate activity minutes per session"),
  NUM("sedentaryMinutesAlt", "Sedentary minutes per day (PAD680)"),
  NUM("sleepHoursWeekday", "Sleep, weekday (hours)"),
  NUM("sleepHoursWeekend", "Sleep, weekend (hours)"),
  { kind: "select", name: "race", label: "Race/ethnicity (RIDRETH3)", options: RACE_OPTIONS },
  { kind: "select", name: "education", label: "Education (DMDEDUC2)", options: EDUCATION_OPTIONS },
];

export function initialValues(): FormValues {
  const values: FormValues = { heartRate: "", notes: "" };
  for (const f of REQUIRED_FIELDS) values[f.name] = "";
  for (const f of MORE_FIELDS) values[f.name] = "";
  return values;
}

const isBlank = (value: string | undefined) => (value ?? "").trim() === "";

function rangeError(label: string, name: string, raw: string): string | null {
  const range = INPUT_RANGES[name];
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Enter a number.";
  if (range && (n < range.min || n > range.max)) return `${label.replace(/ \(.*\)$/, "")} must be between ${range.min} and ${range.max}.`;
  return null;
}

/** Client-side mirror of the API rules, so errors show next to the field instead of as a 422 blob. */
export function validateAssessment(values: FormValues, age: number | null): FormErrors {
  const errors: FormErrors = {};

  if (age === null) {
    errors.age = "Date of birth is missing or invalid, so age can't be derived.";
  } else if (age < MIN_PATIENT_AGE || age > MAX_PATIENT_AGE) {
    errors.age = `Age must be between ${MIN_PATIENT_AGE} and ${MAX_PATIENT_AGE}; the model is adult-only.`;
  }

  for (const field of REQUIRED_FIELDS) {
    const raw = values[field.name];
    if (isBlank(raw)) errors[field.name] = field.kind === "select" ? "Choose Yes/No." : "Required.";
    else if (field.kind === "number") {
      const problem = rangeError(field.label, field.name, raw);
      if (problem) errors[field.name] = problem;
    }
  }

  for (const field of MORE_FIELDS) {
    const raw = values[field.name];
    if (field.kind !== "number" || isBlank(raw)) continue;
    const problem = rangeError(field.label, field.name, raw);
    if (problem) errors[field.name] = problem;
  }

  if (
    !errors.systolicBp &&
    !errors.diastolicBp &&
    Number(values.systolicBp) <= Number(values.diastolicBp)
  ) {
    errors.diastolicBp = "Systolic BP must be greater than diastolic BP.";
  }

  if (!isBlank(values.heartRate)) {
    const bpm = Number(values.heartRate);
    if (!Number.isInteger(bpm) || bpm < HEART_RATE_MIN || bpm > HEART_RATE_MAX) {
      errors.heartRate = `Heart rate must be a whole number between ${HEART_RATE_MIN} and ${HEART_RATE_MAX} bpm.`;
    }
  }

  return errors;
}

type YesNo = "yes" | "no";

const optionalNumber = (raw: string | undefined): number | undefined => (isBlank(raw) ? undefined : Number(raw));
const optionalChoice = (raw: string | undefined): string | undefined => (isBlank(raw) ? undefined : raw);

/** Build the API payload from validated form values. Blank optional inputs are omitted; heartRate only when given. */
export function buildAssessmentPayload(values: FormValues, age: number): RiskAssessmentRequest["payload"] {
  const payload: RiskAssessmentRequest["payload"] = {
    age,
    bmi: Number(values.bmi),
    waistCm: Number(values.waistCm),
    systolicBp: Number(values.systolicBp),
    diastolicBp: Number(values.diastolicBp),
    highBp: values.highBp as YesNo,
    bpMed: values.bpMed as YesNo,
    totalCholesterol: Number(values.totalCholesterol),
    hdl: Number(values.hdl),
    hba1cPercent: Number(values.hba1cPercent),
    hsCrp: Number(values.hsCrp),
    wbc: Number(values.wbc),
    hemoglobin: Number(values.hemoglobin),
    platelets: Number(values.platelets),
    rdw: Number(values.rdw),
    incomeRatio: Number(values.incomeRatio),
    smoker: values.smoker as YesNo,
    diabetic: optionalChoice(values.diabetic) as "yes" | "no" | "borderline" | undefined,
    highChol: optionalChoice(values.highChol) as YesNo | undefined,
    cholMed: optionalChoice(values.cholMed) as YesNo | undefined,
    sodium: optionalNumber(values.sodium),
    vigorousActivityMinutes: optionalNumber(values.vigorousActivityMinutes),
    moderateActivityMinutes: optionalNumber(values.moderateActivityMinutes),
    moderateActivityUnit: optionalNumber(values.moderateActivityUnit),
    sedentaryMinutes: optionalNumber(values.sedentaryMinutes),
    sedentaryMinutesAlt: optionalNumber(values.sedentaryMinutesAlt),
    sleepHoursWeekday: optionalNumber(values.sleepHoursWeekday),
    sleepHoursWeekend: optionalNumber(values.sleepHoursWeekend),
    race: optionalNumber(values.race),
    education: optionalNumber(values.education),
    notes: values.notes.trim() === "" ? undefined : values.notes,
  };
  if (!isBlank(values.heartRate)) payload.heartRate = Number(values.heartRate);
  return payload;
}
