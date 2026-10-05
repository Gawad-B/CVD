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

/** Required, README-compact numeric inputs (Age is derived from the patient's date of birth). */
export const COMPACT_NUMBER_FIELDS: readonly NumberField[] = [
  NUM("bmi", "BMI (kg/m²)"),
  NUM("systolicBp", "Systolic BP (mmHg)"),
  NUM("diastolicBp", "Diastolic BP (mmHg)"),
  NUM("totalCholesterol", "Total cholesterol (mg/dL)"),
  NUM("hdl", "HDL (mg/dL)"),
];

export const SMOKER_OPTIONS = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
] as const;

export const DIABETIC_OPTIONS = [
  { value: "no", label: "No" },
  { value: "borderline", label: "Borderline" },
  { value: "yes", label: "Yes" },
] as const;

const HISTORY_OPTIONS = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
] as const;

/** Every other existing clinical input; all optional, blank means "not recorded" (the API imputes and reports it). */
export const MORE_FIELDS: readonly AssessmentField[] = [
  NUM("hba1cPercent", "HbA1c (%)"),
  NUM("hsCrp", "hs-CRP (mg/L)"),
  NUM("sodium", "Sodium (mmol/L)"),
  NUM("wbc", "WBC (10³/µL)"),
  NUM("hemoglobin", "Hemoglobin (g/dL)"),
  NUM("platelets", "Platelets (10³/µL)"),
  NUM("rdw", "RDW (%)"),
  NUM("waistCm", "Waist (cm)"),
  NUM("vigorousActivityMinutes", "Vigorous activity sessions per unit"),
  NUM("moderateActivityMinutes", "Moderate activity sessions per unit"),
  NUM("sedentaryMinutes", "Moderate activity minutes per session"),
  NUM("sedentaryMinutesAlt", "Sedentary minutes per day (PAD680)"),
  NUM("sleepHoursWeekday", "Sleep, weekday (hours)"),
  NUM("sleepHoursWeekend", "Sleep, weekend (hours)"),
  NUM("incomeRatio", "Income ratio (INDFMPIR)"),
  { kind: "select", name: "moderateActivityUnit", label: "Activity frequency unit (PAD790U)", options: ACTIVITY_UNIT_OPTIONS },
  { kind: "select", name: "highBp", label: "History of high BP", options: HISTORY_OPTIONS },
  { kind: "select", name: "highChol", label: "History of high cholesterol", options: HISTORY_OPTIONS },
  { kind: "select", name: "bpMed", label: "On BP medication", options: HISTORY_OPTIONS },
  { kind: "select", name: "cholMed", label: "On cholesterol medication", options: HISTORY_OPTIONS },
  { kind: "select", name: "race", label: "Race/ethnicity (RIDRETH3)", options: RACE_OPTIONS },
  { kind: "select", name: "education", label: "Education (DMDEDUC2)", options: EDUCATION_OPTIONS },
];

export function initialValues(): FormValues {
  const values: FormValues = { smoker: "", diabetic: "", heartRate: "", notes: "" };
  for (const f of COMPACT_NUMBER_FIELDS) values[f.name] = "";
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

  if (isBlank(values.smoker)) errors.smoker = "Choose Yes/No.";
  if (isBlank(values.diabetic)) errors.diabetic = "Choose No/Borderline/Yes.";

  for (const field of COMPACT_NUMBER_FIELDS) {
    const raw = values[field.name];
    if (isBlank(raw)) errors[field.name] = "Required.";
    else {
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

  if (!errors.systolicBp && !errors.diastolicBp && Number(values.systolicBp) <= Number(values.diastolicBp)) {
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

const optionalNumber = (raw: string | undefined): number | undefined => (isBlank(raw) ? undefined : Number(raw));
const optionalChoice = (raw: string | undefined): string | undefined => (isBlank(raw) ? undefined : raw);

/** Build the API payload from validated form values. Blank optional inputs are omitted; heartRate only when given. */
export function buildAssessmentPayload(values: FormValues, age: number): RiskAssessmentRequest["payload"] {
  const payload: RiskAssessmentRequest["payload"] = {
    systolicBp: Number(values.systolicBp),
    diastolicBp: Number(values.diastolicBp),
    totalCholesterol: Number(values.totalCholesterol),
    hdl: Number(values.hdl),
    bmi: Number(values.bmi),
    smoker: values.smoker as "yes" | "no",
    diabetic: values.diabetic as "yes" | "no" | "borderline",
    age,
    hba1cPercent: optionalNumber(values.hba1cPercent),
    hsCrp: optionalNumber(values.hsCrp),
    sodium: optionalNumber(values.sodium),
    wbc: optionalNumber(values.wbc),
    hemoglobin: optionalNumber(values.hemoglobin),
    platelets: optionalNumber(values.platelets),
    rdw: optionalNumber(values.rdw),
    waistCm: optionalNumber(values.waistCm),
    vigorousActivityMinutes: optionalNumber(values.vigorousActivityMinutes),
    moderateActivityMinutes: optionalNumber(values.moderateActivityMinutes),
    sedentaryMinutes: optionalNumber(values.sedentaryMinutes),
    sedentaryMinutesAlt: optionalNumber(values.sedentaryMinutesAlt),
    sleepHoursWeekday: optionalNumber(values.sleepHoursWeekday),
    sleepHoursWeekend: optionalNumber(values.sleepHoursWeekend),
    incomeRatio: optionalNumber(values.incomeRatio),
    moderateActivityUnit: optionalNumber(values.moderateActivityUnit),
    race: optionalNumber(values.race),
    education: optionalNumber(values.education),
    highBp: optionalChoice(values.highBp) as "yes" | "no" | undefined,
    highChol: optionalChoice(values.highChol) as "yes" | "no" | undefined,
    bpMed: optionalChoice(values.bpMed) as "yes" | "no" | undefined,
    cholMed: optionalChoice(values.cholMed) as "yes" | "no" | undefined,
    notes: values.notes.trim() === "" ? undefined : values.notes,
  };
  if (!isBlank(values.heartRate)) payload.heartRate = Number(values.heartRate);
  return payload;
}
