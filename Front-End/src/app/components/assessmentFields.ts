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
  /** Short plain-language help shown under the field: what it is and the normal range. */
  hint?: string;
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

const NUM = (name: string, label: string, hint?: string): NumberField => ({ kind: "number", name, label, hint });

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
  NUM("bmi", "BMI (kg/m²)", "Weight (kg) ÷ height (m)². Healthy 18.5–24.9."),
  NUM("systolicBp", "Systolic BP (mmHg)", "Top number. Normal under 120."),
  NUM("diastolicBp", "Diastolic BP (mmHg)", "Bottom number. Normal under 80."),
  { kind: "select", name: "highBp", label: "History of high BP", options: YES_NO_OPTIONS, hint: "Ever told by a doctor they have high blood pressure." },
  { kind: "select", name: "bpMed", label: "On BP medication", options: YES_NO_OPTIONS, when: (v) => v.highBp === "yes", hint: "Currently taking blood-pressure tablets." },
  NUM("totalCholesterol", "Total cholesterol (mg/dL)", "From the lipid panel. Desirable under 200."),
  NUM("hdl", "HDL (mg/dL)", "“Good” cholesterol. Low: under 40 (men) or 50 (women)."),
  NUM("triglycerides", "Triglycerides (mg/dL)", "From the same lipid panel. Normal under 150."),
  { kind: "select", name: "highChol", label: "History of high cholesterol", options: YES_NO_OPTIONS, hint: "Ever told by a doctor they have high cholesterol." },
  { kind: "select", name: "cholMed", label: "On cholesterol-lowering medication", options: YES_NO_OPTIONS, hint: "Currently taking a statin or similar." },
  NUM("creatinine", "Creatinine (mg/dL)", "Kidney blood test, used to calculate eGFR. Typical 0.6–1.3."),
  NUM("hba1cPercent", "HbA1c (%)", "3-month average blood sugar. Normal under 5.7; diabetes 6.5 or more."),
  { kind: "select", name: "diabetic", label: "Diabetic", options: DIABETIC_OPTIONS, hint: "Diagnosed by a doctor. Borderline means prediabetes." },
  { ...NUM("urineAcr", "Urine albumin/creatinine (mg/g)", "Urine test for kidney damage, needed for diabetics. Normal under 30."), when: isDiabetic },
  { kind: "select", name: "smoker", label: "Ever smoked (100+ cigarettes)", options: YES_NO_OPTIONS, hint: "At least 100 cigarettes in their whole life." },
  { kind: "select", name: "smokesNow", label: "Smokes now", options: YES_NO_OPTIONS, when: (v) => v.smoker === "yes", hint: "Smokes every day or some days." },
  { kind: "select", name: "generalHealth", label: "Self-rated general health", options: GENERAL_HEALTH_OPTIONS, hint: "Ask: “How would you rate your health in general?”" },
];

/** Lower-weight inputs; all optional, blank means "not recorded" (the API imputes and reports it). */
export const MORE_FIELDS: readonly AssessmentField[] = [
  NUM("waistCm", "Waist (cm)", "At the navel. High: over 102 (men) or 88 (women)."),
  { ...NUM("urineAcr", "Urine albumin/creatinine (mg/g)", "Urine test for kidney damage. Normal under 30."), when: (v) => !isDiabetic(v) },
  NUM("glucose", "Glucose (mg/dL)", "Fasting blood sugar. Normal 70–99."),
  NUM("uricAcid", "Uric acid (mg/dL)", "Typical 3.5–7.2."),
  NUM("hsCrp", "hs-CRP (mg/L)", "Inflammation marker. Under 1 low, over 3 high."),
  NUM("sodium", "Sodium (mmol/L)", "Normal 135–145."),
  NUM("wbc", "WBC (10³/µL)", "White blood cells. Normal 4–11."),
  NUM("hemoglobin", "Hemoglobin (g/dL)", "Typical 12–17."),
  NUM("platelets", "Platelets (10³/µL)", "Normal 150–450."),
  NUM("rdw", "RDW (%)", "Red-cell size variation. Normal 11.5–14.5."),
  NUM("sleepHoursWeekday", "Sleep, weekday (hours)", "Usual hours of sleep on a work night."),
  NUM("sleepHoursWeekend", "Sleep, weekend (hours)", "Usual hours of sleep on a day off."),
  NUM("sedentaryMinutesAlt", "Sedentary minutes per day", "Time sitting: work, TV, computer, driving."),
  NUM("incomeRatio", "Income-to-poverty ratio", "Family income ÷ poverty line. 1 = at the line, 5 = five times or more."),
  { kind: "select", name: "race", label: "Race/ethnicity", options: RACE_OPTIONS, hint: "Self-reported. Used only as a statistical input." },
  { kind: "select", name: "education", label: "Education", options: EDUCATION_OPTIONS, hint: "Highest level completed." },
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
