// Raw NHANES column -> human label (mirrors Back-End/model/feature_schema.json "labels").
export const FEATURE_LABELS: Record<string, string> = {
  PAD810Q: "Vigorous activity sessions per unit",
  PAD790Q: "Moderate activity sessions per unit",
  PAD800: "Moderate activity minutes per session",
  PAD680: "Sedentary minutes per day",
  SLD012: "Sleep hours (weekday)",
  SLD013: "Sleep hours (weekend)",
  RIDAGEYR: "Age",
  INDFMPIR: "Income-to-poverty ratio",
  BMXBMI: "BMI (kg/m²)",
  BMXWAIST: "Waist (cm)",
  BPXOSY1: "Systolic BP (mmHg)",
  BPXODI1: "Diastolic BP (mmHg)",
  LBXTC: "Total cholesterol (mg/dL)",
  LBDHDD: "HDL (mg/dL)",
  LBXGH: "HbA1c (%)",
  LBXHSCRP: "hs-CRP (mg/L)",
  LBXSNASI: "Sodium (mmol/L)",
  LBXWBCSI: "WBC (10³/µL)",
  LBXHGB: "Hemoglobin (g/dL)",
  LBXPLTSI: "Platelets (10³/µL)",
  LBXRDW: "RDW (%)",
  SMQ020: "Smoker",
  PAD790U: "Activity frequency unit",
  DIQ010: "Diabetes",
  RIAGENDR: "Sex",
  RIDRETH3: "Race/ethnicity",
  DMDEDUC2: "Education",
  BPQ101D: "On BP medication",
  BPQ020: "High blood pressure",
  BPQ080: "High cholesterol",
  RXQ033: "On cholesterol medication",
};

// Shown wherever a model score is displayed: the number is not an absolute risk.
export const SCORE_DISCLAIMER = "Not calibrated to population prevalence; this is not an absolute risk.";

// Code maps mirror Back-End/ml/inference.py (RACE_CODES, EDUCATION_CODES, activity unit).
export const RACE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: 'Mexican American' },
  { value: '2', label: 'Other Hispanic' },
  { value: '3', label: 'Non-Hispanic White' },
  { value: '4', label: 'Non-Hispanic Black' },
  { value: '6', label: 'Non-Hispanic Asian' },
  { value: '7', label: 'Other Race - Including Multi-Racial' },
];

export const EDUCATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: 'Less than 9th grade' },
  { value: '2', label: '9-11th grade (Includes 12th grade with no diploma)' },
  { value: '3', label: 'High school graduate/GED or equivalent' },
  { value: '4', label: 'Some college or AA degree' },
  { value: '5', label: 'College graduate or above' },
];

export const ACTIVITY_UNIT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: 'Day' },
  { value: '2', label: 'Week' },
  { value: '3', label: 'Month' },
  { value: '4', label: 'Year' },
];

// Inclusive input ranges; must match RiskAssessmentRequest in Back-End/app.py.
export const INPUT_RANGES: Record<string, { min: number; max: number; step: string }> = {
  systolicBp: { min: 60, max: 260, step: 'any' },
  diastolicBp: { min: 30, max: 160, step: 'any' },
  totalCholesterol: { min: 70, max: 500, step: 'any' },
  hdl: { min: 10, max: 150, step: 'any' },
  bmi: { min: 10, max: 80, step: 'any' },
  hba1cPercent: { min: 3, max: 20, step: 'any' },
  hsCrp: { min: 0, max: 300, step: 'any' },
  sodium: { min: 110, max: 170, step: 'any' },
  wbc: { min: 1, max: 50, step: 'any' },
  hemoglobin: { min: 5, max: 22, step: 'any' },
  platelets: { min: 20, max: 1500, step: 'any' },
  rdw: { min: 8, max: 30, step: 'any' },
  vigorousActivityMinutes: { min: 0, max: 50, step: 'any' },
  moderateActivityMinutes: { min: 0, max: 50, step: 'any' },
  sedentaryMinutes: { min: 0, max: 600, step: 'any' },
  sedentaryMinutesAlt: { min: 0, max: 1440, step: 'any' },
  sleepHoursWeekday: { min: 0, max: 24, step: 'any' },
  sleepHoursWeekend: { min: 0, max: 24, step: 'any' },
  waistCm: { min: 40, max: 200, step: 'any' },
  incomeRatio: { min: 0, max: 5, step: 'any' },
};
