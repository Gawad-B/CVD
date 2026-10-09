export interface Patient {
  patientId: number;
  externalPatientCode: string;
  sex: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  createdAt: string;
  lastAssessment?: PatientLastAssessment | null;
}

export interface PatientLastAssessment {
  assessmentId: number;
  createdAt: string;
  probabilityCvd: number;
  riskLevel: RiskLevel;
  effectiveRiskLevel: RiskLevel;
  reviewStatus: string;
  levelSource?: LevelSource;
  preventRisk?: number;
}

/** What set an assessment's level: clinical alerts, the PREVENT equation, or the ML model. */
export type LevelSource = "alerts" | "prevent" | "model";

/** "unknown" = the API sent a value this client does not recognise; shown neutrally, never as low. */
export type RiskLevel = "low" | "medium" | "high" | "unknown";

export interface EncounterFeature {
  featureId: number;
  encounterId: number;
  featureCode: string;
  featureValue: string;
  valueType: string;
}

export interface Encounter {
  encounterId: number;
  patientId: number;
  encounterDate: string;
  notes: string;
  features: EncounterFeature[];
}

export interface CreateEncounterInput {
  patientId: number;
  notes?: string;
  features?: Array<{
    name: string;
    value: string | number | boolean;
    valueType?: "string" | "number" | "boolean" | "date" | "json";
  }>;
}

export interface Model {
  modelId: number;
  modelName: string;
  modelVersion: string;
  algorithm: string;
  useCase: string;
  isActive: boolean;
  /** active = scoring new assessments; available = installed, can be activated; retired = no longer installed. */
  status: "active" | "available" | "retired";
  /** What the outcome/label is (from the training notebook). */
  description: string;
  /** What the model's score means, e.g. "10-year probability of cardiovascular death". */
  scoreMeaning?: string;
  /** What the score does not tell you. */
  scoreCaveat?: string;
  /** Age span of the training data; ages outside it are scored as the nearest trained age. */
  ageMin?: number;
  ageMax?: number;
  auc: number;
  aucCi95?: [number, number];
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  specificity?: number;
  npv?: number;
  prAuc?: number;
  nTest?: number;
  trainedAt: string;
}

export interface RiskAssessment {
  assessmentId: number;
  encounterId: number;
  patientId: number;
  patientName: string;
  /** Patient code, sex and age for display; never DOB/contact details. */
  externalPatientCode?: string;
  patientSex?: string | null;
  patientAge?: number | null;
  modelId: number;
  modelName: string;
  probabilityCvd: number;
  predictedLabel: string;
  riskLevel: RiskLevel;
  assessmentStatus: string;
  reviewStatus: string;
  reviewedByUsername?: string;
  reviewedAt?: string;
  reviewComment?: string;
  recommendation: string;
  createdAt: string;
  modelVersion?: string;
  explanation?: AssessmentExplanation;
  /** Measured heart rate in bpm, when the clinician recorded one (not a model input). */
  heartRate?: number | null;
  /** Raw model inputs by NHANES column (detail endpoint only). Numbers are numbers, categoricals strings like "1.0". */
  inputs?: Record<string, number | string | null>;
  overrideRiskLevel?: RiskLevel | null;
  overrideRecommendation?: string | null;
  overrideReason?: string | null;
  overriddenByUsername?: string | null;
  overriddenAt?: string | null;
  /** Override wins over the model's level. */
  effectiveRiskLevel: RiskLevel;
  effectiveRecommendation: string;
  overrideHistory?: OverrideHistoryEntry[];
  levelSource?: LevelSource;
  preventRisk?: number;
}

export interface OverrideHistoryEntry {
  riskLevel: RiskLevel | null;
  recommendation: string | null;
  reason: string;
  overriddenByUsername: string;
  createdAt: string;
}

export interface OverrideInput {
  /** Omit to keep the current value, null to clear it. */
  riskLevel?: RiskLevel | null;
  recommendation?: string | null;
  reason: string;
}

export interface OverrideResult {
  assessmentId: number;
  reviewStatus: string;
  heartRate?: number | null;
  overrideRiskLevel?: RiskLevel | null;
  overrideRecommendation?: string | null;
  overrideReason?: string | null;
  overriddenByUsername?: string | null;
  overriddenAt?: string | null;
  effectiveRiskLevel: RiskLevel;
  effectiveRecommendation: string;
}

export interface RiskAssessmentFilters {
  reviewStatus?: "pending" | "reviewed";
  limit?: number;
}

export interface DemoAccount {
  username: string;
  password: string;
  expiresAt: string;
}

export interface FactorContribution {
  feature: string;
  label: string;
  value: number | string;
  reference: number | string;
  delta: number;
}

/** Guideline rule hit on the raw readings, independent of the model score. */
export interface ClinicalAlert {
  code: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
}

/** AHA PREVENT 10-year total CVD risk, or why it could not be calculated. */
export interface PreventResult {
  available: boolean;
  /** 0-1 when available. */
  risk?: number;
  category?: "low" | "borderline" | "intermediate" | "high";
  /** Which PREVENT equation was used: base, + UACR, + HbA1c, or both. */
  model?: "base" | "uacr" | "hba1c" | "full";
  egfr?: number;
  reason?: string;
  /** Unavailable because no validated equation exists for the patient's age (outside 30-79). */
  ageOutOfRange?: boolean;
  /** 30-year total CVD risk (0-1), ages 30-59 only. */
  risk30?: number;
  model30?: "base" | "uacr" | "hba1c";
}

export interface AssessmentExplanation {
  missingInputs: string[];
  modelVersion?: string;
  contributions: FactorContribution[];
  explanationError?: boolean;
  /** Level from the ML score alone. */
  modelRiskLevel?: RiskLevel;
  /** Level before clinical alerts: from PREVENT when available, otherwise the ML level. */
  baseRiskLevel?: RiskLevel;
  riskSource?: "prevent" | "model";
  prevent?: PreventResult;
  clinicalAlerts: ClinicalAlert[];
  /** What the ML score means for the model that scored this assessment. */
  scoreMeaning?: string;
  /** What that score does not tell you. */
  scoreCaveat?: string;
}

export type AuditOutcome = "success" | "failure" | "denied";

export interface AuditLogEntry {
  auditLogId: number;
  actorUsername: string;
  actionType: string;
  resourceType: string;
  resourceId: number;
  patientId?: number;
  outcome: string;
  /** Request path that produced the entry, when recorded. */
  endpoint?: string;
  ipAddress: string;
  createdAt: string;
}

export interface User {
  userId: number;
  username: string;
  email: string;
  fullName: string;
  role: "admin" | "doctor" | "clinician" | "auditor";
  isActive?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  isDemo?: boolean;
  demoExpiresAt?: string | null;
}

export interface CreateUserInput {
  username: string;
  email: string;
  role: "admin" | "doctor" | "clinician" | "auditor";
  password: string;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  role?: "admin" | "doctor" | "clinician" | "auditor";
  isActive?: boolean;
  password?: string;
}

export interface RiskAssessmentRequest {
  patientId: number;
  payload: {
    // Required: the AHA PREVENT inputs plus the strongest inputs of the NHANES model.
    age?: number;
    bmi: number;
    systolicBp: number;
    diastolicBp: number;
    highBp: "yes" | "no";
    bpMed: "yes" | "no";
    totalCholesterol: number;
    hdl: number;
    highChol: "yes" | "no";
    cholMed: "yes" | "no";
    creatinine: number;
    hba1cPercent: number;
    diabetic: "yes" | "no" | "borderline";
    smoker: "yes" | "no";
    smokesNow: "yes" | "no";
    generalHealth: number;
    // Optional: imputed by the model when omitted.
    waistCm?: number;
    urineAcr?: number;
    triglycerides?: number;
    glucose?: number;
    uricAcid?: number;
    hsCrp?: number;
    sodium?: number;
    wbc?: number;
    hemoglobin?: number;
    platelets?: number;
    rdw?: number;
    sleepHoursWeekday?: number;
    sleepHoursWeekend?: number;
    sedentaryMinutesAlt?: number;
    incomeRatio?: number;
    race?: number;
    education?: number;
    notes?: string;
    /** Optional measured heart rate, 30-220 bpm. Stored with the assessment, not a model input. */
    heartRate?: number;
  };
}

export interface RiskAssessmentResponse {
  probability: number;
  riskLevel: "low" | "medium" | "high";
  recommendation: string;
  assessmentId?: number;
  createdAt?: string;
  heartRate?: number | null;
  missingInputs?: string[];
  modelVersion?: string;
  contributions?: FactorContribution[];
  explanationError?: boolean;
  modelRiskLevel?: "low" | "medium" | "high";
  baseRiskLevel?: "low" | "medium" | "high";
  riskSource?: "prevent" | "model";
  prevent?: PreventResult;
  clinicalAlerts?: ClinicalAlert[];
  modelName?: string;
  scoreMeaning?: string;
  scoreCaveat?: string;
}

export interface DashboardStats {
  totalPatients: number;
  totalAssessments: number;
  riskDistribution: Record<string, number>;
  activeModelAccuracy: number;
  /** Assessments awaiting sign-off. */
  pendingReview: number;
  /** Assessments whose effective risk level is high. */
  highRisk: number;
  recentAssessments: Array<{
    id: number;
    patientId: number;
    probabilityCvd: number;
    riskLevel: RiskLevel;
    effectiveRiskLevel: RiskLevel;
    createdAt: string;
    externalPatientCode: string;
  }>;
}
