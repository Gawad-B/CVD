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
}

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
  auc: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
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

export interface AssessmentExplanation {
  missingInputs: string[];
  modelVersion?: string;
  contributions: FactorContribution[];
  explanationError?: boolean;
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
    systolicBp: number;
    diastolicBp: number;
    totalCholesterol: number;
    hdl: number;
    bmi: number;
    smoker: "yes" | "no";
    diabetic: "yes" | "no" | "borderline";
    age?: number;
    waistCm?: number;
    hba1cPercent?: number;
    hsCrp?: number;
    sodium?: number;
    wbc?: number;
    hemoglobin?: number;
    platelets?: number;
    rdw?: number;
    race?: number;
    education?: number;
    incomeRatio?: number;
    vigorousActivityMinutes?: number;
    moderateActivityMinutes?: number;
    moderateActivityUnit?: number;
    sedentaryMinutes?: number;
    sedentaryMinutesAlt?: number;
    sleepHoursWeekday?: number;
    sleepHoursWeekend?: number;
    highBp?: "yes" | "no";
    highChol?: "yes" | "no";
    bpMed?: "yes" | "no";
    cholMed?: "yes" | "no";
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
