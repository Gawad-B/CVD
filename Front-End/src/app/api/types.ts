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
}

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
  modelId: number;
  modelName: string;
  probabilityCvd: number;
  predictedLabel: string;
  riskLevel: "low" | "medium" | "high";
  assessmentStatus: string;
  reviewStatus: string;
  recommendation: string;
  createdAt: string;
}

export interface AuditLogEntry {
  auditLogId: number;
  actorUsername: string;
  actionType: string;
  resourceType: string;
  resourceId: number;
  patientId?: number;
  outcome: string;
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
  };
}

export interface RiskAssessmentResponse {
  probability: number;
  riskLevel: "low" | "medium" | "high";
  recommendation: string;
}

export interface DashboardStats {
  activeModelAccuracy: number;
}
