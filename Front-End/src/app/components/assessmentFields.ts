import type { RiskAssessmentRequest } from "../api/types";
import { EDUCATION_OPTIONS, GENERAL_HEALTH_OPTIONS, INPUT_RANGES, RACE_OPTIONS } from "./clinicalConstants";
import { MAX_PATIENT_AGE, MIN_PATIENT_AGE } from "./dateOfBirth";

export type FormValues = Record<string, string>;
export type FormErrors = Record<string, string>;

export const HEART_RATE_MIN = 30;
export const HEART_RATE_MAX = 220;

interface FieldBase {
  name: string;
  label: string;
  /** Shown (and, for required fields, required) only when this returns true. */
  when?: (values: FormValues) => boolean;
}
interface NumberField extends FieldBase {
  kind: "number";
}
interface SelectField extends FieldBase {
  kind: "select";
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

const isDiabetic = (v: FormValues) => v.diabetic === "yes";

/** Whether a field applies given the current answers (NHANES skip patterns). */
export const isShown = (field: AssessmentField, values: FormValues) => !field.when || field.when(values);

/**
 * Required inputs: everything the AHA PREVENT 10-year risk needs (age from the date of birth, sex
 * from the patient record, BP, cholesterol, kidney function via creatinine, diabetes, current
 * smoking, BP and cholesterol medication, HbA1c) plus the strongest inputs of the NHANES model,
 * plus what a clinician expects on any cardiovascular screen: the full lipid panel (triglycerides)
 * and, for diabetics, urine albumin/creatinine (annual per ADA/KDIGO; it also refines PREVENT).
 * Heart rate is required too but is recorded outside these lists (it is not a model input).
 */
export const REQUIRED_FIELDS: readonly AssessmentField[] = [
  NUM("bmi", "BMI (kg/m²)"),
  NUM("systolicBp", "Systolic BP (mmHg)"),
  NUM("diastolicBp", "Diastolic BP (mmHg)"),
  { kind: "select", name: "highBp", label: "History of high BP", options: YES_NO_OPTIONS },
  { kind: "select", name: "bpMed", label: "On BP medication", options: YES_NO_OPTIONS, when: (v) => v.highBp === "yes" },
  NUM("totalCholesterol", "Total cholesterol (mg/dL)"),
  NUM("hdl", "HDL (mg/dL)"),
  NUM("triglycerides", "Triglycerides (mg/dL)"),
  { kind: "select", name: "highChol", label: "History of high cholesterol", options: YES_NO_OPTIONS },
  { kind: "select", name: "cholMed", label: "On cholesterol-lowering medication", options: YES_NO_OPTIONS },
  NUM("creatinine", "Creatinine (mg/dL)"),
  NUM("hba1cPercent", "HbA1c (%)"),
  { kind: "select", name: "diabetic", label: "Diabetic", options: DIABETIC_OPTIONS },
  { ...NUM("urineAcr", "Urine albumin/creatinine (mg/g)"), when: isDiabetic },
  { kind: "select", name: "smoker", label: "Ever smoked (100+ cigarettes)", options: YES_NO_OPTIONS },
  { kind: "select", name: "smokesNow", label: "Smokes now", options: YES_NO_OPTIONS, when: (v) => v.smoker === "yes" },
  { kind: "select", name: "generalHealth", label: "Self-rated general health", options: GENERAL_HEALTH_OPTIONS },
];

/** Lower-weight inputs; all optional, blank means "not recorded" (the API imputes and reports it). */
export const MORE_FIELDS: readonly AssessmentField[] = [
  NUM("waistCm", "Waist (cm)"),
  { ...NUM("urineAcr", "Urine albumin/creatinine (mg/g)"), when: (v) => !isDiabetic(v) },
  NUM("glucose", "Glucose (mg/dL)"),
  NUM("uricAcid", "Uric acid (mg/dL)"),
  NUM("hsCrp", "hs-CRP (mg/L)"),
  NUM("sodium", "Sodium (mmol/L)"),
  NUM("wbc", "WBC (10³/µL)"),
  NUM("hemoglobin", "Hemoglobin (g/dL)"),
  NUM("platelets", "Platelets (10³/µL)"),
  NUM("rdw", "RDW (%)"),
  NUM("sleepHoursWeekday", "Sleep, weekday (hours)"),
  NUM("sleepHoursWeekend", "Sleep, weekend (hours)"),
  NUM("sedentaryMinutesAlt", "Sedentary minutes per day"),
  NUM("incomeRatio", "Income-to-poverty ratio"),
  { kind: "select", name: "race", label: "Race/ethnicity", options: RACE_OPTIONS },
  { kind: "select", name: "education", label: "Education", options: EDUCATION_OPTIONS },
];

export function initialValues(): FormValues {
  const values: FormValues = { heartRate: "", notes: "" };
  for (const f of REQUIRED_FIELDS) values[f.name] = "";
  for (const f of MORE_FIELDS) values[f.name] ??= "";
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
    if (!isShown(field, values)) continue;
    const raw = values[field.name];
    if (isBlank(raw)) errors[field.name] = field.kind === "select" ? "Choose an option." : "Required.";
    else if (field.kind === "number") {
      const problem = rangeError(field.label, field.name, raw);
      if (problem) errors[field.name] = problem;
    }
  }

  for (const field of MORE_FIELDS) {
    const raw = values[field.name];
    if (field.kind !== "number" || !isShown(field, values) || isBlank(raw)) continue;
    const problem = rangeError(field.label, field.name, raw);
    if (problem) errors[field.name] = problem;
  }

  if (!errors.systolicBp && !errors.diastolicBp && Number(values.systolicBp) <= Number(values.diastolicBp)) {
    errors.diastolicBp = "Systolic BP must be greater than diastolic BP.";
  }

  if (isBlank(values.heartRate)) {
    errors.heartRate = "Required.";
  } else {
    const bpm = Number(values.heartRate);
    if (!Number.isInteger(bpm) || bpm < HEART_RATE_MIN || bpm > HEART_RATE_MAX) {
      errors.heartRate = `Heart rate must be a whole number between ${HEART_RATE_MIN} and ${HEART_RATE_MAX} bpm.`;
    }
  }

  return errors;
}

type YesNo = "yes" | "no";

const optionalNumber = (raw: string | undefined): number | undefined => (isBlank(raw) ? undefined : Number(raw));

/** Build the API payload from validated form values. Blank optional inputs are omitted. */
export function buildAssessmentPayload(values: FormValues, age: number): RiskAssessmentRequest["payload"] {
  const smoker = values.smoker as YesNo;
  const highBp = values.highBp as YesNo;
  const payload: RiskAssessmentRequest["payload"] = {
    age,
    bmi: Number(values.bmi),
    systolicBp: Number(values.systolicBp),
    diastolicBp: Number(values.diastolicBp),
    highBp,
    // Questions that do not apply are answered by the skip pattern: no high BP -> no BP medication.
    bpMed: highBp === "yes" ? (values.bpMed as YesNo) : "no",
    totalCholesterol: Number(values.totalCholesterol),
    hdl: Number(values.hdl),
    highChol: values.highChol as YesNo,
    cholMed: values.cholMed as YesNo,
    creatinine: Number(values.creatinine),
    hba1cPercent: Number(values.hba1cPercent),
    diabetic: values.diabetic as "yes" | "no" | "borderline",
    smoker,
    smokesNow: smoker === "yes" ? (values.smokesNow as YesNo) : "no",
    generalHealth: Number(values.generalHealth),
    waistCm: optionalNumber(values.waistCm),
    urineAcr: optionalNumber(values.urineAcr),
    triglycerides: Number(values.triglycerides),
    glucose: optionalNumber(values.glucose),
    uricAcid: optionalNumber(values.uricAcid),
    hsCrp: optionalNumber(values.hsCrp),
    sodium: optionalNumber(values.sodium),
    wbc: optionalNumber(values.wbc),
    hemoglobin: optionalNumber(values.hemoglobin),
    platelets: optionalNumber(values.platelets),
    rdw: optionalNumber(values.rdw),
    sleepHoursWeekday: optionalNumber(values.sleepHoursWeekday),
    sleepHoursWeekend: optionalNumber(values.sleepHoursWeekend),
    sedentaryMinutesAlt: optionalNumber(values.sedentaryMinutesAlt),
    incomeRatio: optionalNumber(values.incomeRatio),
    race: optionalNumber(values.race),
    education: optionalNumber(values.education),
    notes: values.notes.trim() === "" ? undefined : values.notes,
  };
  payload.heartRate = Number(values.heartRate);
  return payload;
}
