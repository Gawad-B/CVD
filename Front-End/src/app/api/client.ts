import type {
  AuditLogEntry,
  CreateEncounterInput,
  CreateUserInput,
  DashboardStats,
  Encounter,
  Model,
  Patient,
  RiskAssessment,
  RiskAssessmentRequest,
  RiskAssessmentResponse,
  UpdateUserInput,
  User,
} from "./types";
import { getAuthToken } from "../context/AuthContext";

const rawApiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL;
const API_BASE_URL = typeof rawApiBaseUrl === "string" ? rawApiBaseUrl.replace(/\/$/, "") : "";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    ...init,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function asArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value as T[];
}

function mapPatient(raw: any): Patient {
  return {
    patientId: Number(raw.patientId ?? raw.patient_id ?? 0),
    externalPatientCode: String(raw.externalPatientCode ?? raw.external_patient_code ?? ""),
    sex: raw.sex ?? null,
    firstName: String(raw.firstName ?? raw.first_name ?? ""),
    lastName: String(raw.lastName ?? raw.last_name ?? ""),
    dateOfBirth: String(raw.dateOfBirth ?? raw.date_of_birth ?? ""),
    phone: String(raw.phone ?? ""),
    email: String(raw.email ?? ""),
    createdAt: String(raw.createdAt ?? raw.created_at ?? new Date().toISOString()),
  };
}

function mapEncounter(raw: any): Encounter {
  return {
    encounterId: Number(raw.encounterId ?? raw.encounter_id ?? 0),
    patientId: Number(raw.patientId ?? raw.patient_id ?? 0),
    encounterDate: String(raw.encounterDate ?? raw.encounter_date ?? new Date().toISOString()),
    notes: String(raw.notes ?? ""),
    features: asArray<any>(raw.features).map((feature) => ({
      featureId: Number(feature.featureId ?? feature.feature_id ?? 0),
      encounterId: Number(feature.encounterId ?? feature.encounter_id ?? 0),
      featureCode: String(feature.featureCode ?? feature.feature_code ?? ""),
      featureValue: String(feature.featureValue ?? feature.feature_value ?? ""),
      valueType: String(feature.valueType ?? feature.value_type ?? "string"),
    })),
  };
}

function mapModel(raw: any): Model {
  return {
    modelId: Number(raw.modelId ?? raw.model_id ?? 0),
    modelName: String(raw.modelName ?? raw.model_name ?? ""),
    modelVersion: String(raw.modelVersion ?? raw.model_version ?? ""),
    algorithm: String(raw.algorithm ?? ""),
    useCase: String(raw.useCase ?? raw.use_case ?? ""),
    isActive: Boolean(raw.isActive ?? raw.is_active),
    auc: Number(raw.auc ?? 0),
    accuracy: Number(raw.accuracy ?? 0),
    precision: Number(raw.precision ?? raw.precision_score ?? 0),
    recall: Number(raw.recall ?? raw.recall_score ?? 0),
    f1Score: Number(raw.f1Score ?? raw.f1_score ?? 0),
    trainedAt: String(raw.trainedAt ?? raw.trained_at ?? new Date().toISOString()),
  };
}

function mapRiskAssessment(raw: any): RiskAssessment {
  return {
    assessmentId: Number(raw.assessmentId ?? raw.assessment_id ?? 0),
    encounterId: Number(raw.encounterId ?? raw.encounter_id ?? 0),
    patientId: Number(raw.patientId ?? raw.patient_id ?? 0),
    patientName: String(raw.patientName ?? raw.patient_name ?? `Patient ${Number(raw.patientId ?? raw.patient_id ?? 0)}`),
    modelId: Number(raw.modelId ?? raw.model_id ?? 0),
    modelName: String(raw.modelName ?? raw.model_name ?? ""),
    probabilityCvd: Number(raw.probabilityCvd ?? raw.probability_cvd ?? 0),
    predictedLabel: String(raw.predictedLabel ?? raw.predicted_label ?? ""),
    riskLevel: (raw.riskLevel ?? raw.risk_level ?? "low") as RiskAssessment["riskLevel"],
    assessmentStatus: String(raw.assessmentStatus ?? raw.assessment_status ?? ""),
    reviewStatus: String(raw.reviewStatus ?? raw.review_status ?? ""),
    recommendation: String(raw.recommendation ?? raw.recommendation_text ?? ""),
    createdAt: String(raw.createdAt ?? raw.created_at ?? new Date().toISOString()),
  };
}

function mapAuditLog(raw: any): AuditLogEntry {
  return {
    auditLogId: Number(raw.auditLogId ?? raw.audit_log_id ?? 0),
    actorUsername: String(raw.actorUsername ?? raw.actor_username ?? raw.username ?? "system"),
    actionType: String(raw.actionType ?? raw.action_type ?? "read"),
    resourceType: String(raw.resourceType ?? raw.resource_type ?? ""),
    resourceId: Number(raw.resourceId ?? raw.resource_id ?? 0),
    patientId: raw.patientId ?? raw.patient_id,
    outcome: String(raw.outcome ?? "success"),
    ipAddress: String(raw.ipAddress ?? raw.ip_address ?? ""),
    createdAt: String(raw.createdAt ?? raw.created_at ?? new Date().toISOString()),
  };
}

function mapUser(raw: any): User {
  return {
    userId: Number(raw.userId ?? raw.user_id ?? 0),
    username: String(raw.username ?? ""),
    email: String(raw.email ?? ""),
    fullName: String(raw.fullName ?? raw.full_name ?? ""),
    role: String(raw.role ?? "clinician") as User["role"],
    isActive: raw.isActive ?? raw.is_active,
    lastLoginAt: raw.lastLoginAt ?? raw.last_login_at,
    createdAt: raw.createdAt ?? raw.created_at,
  };
}

export async function getPatients(): Promise<Patient[]> {
  const data = await fetchJson<any[]>("/api/patients");
  return asArray<any>(data).map(mapPatient);
}

export async function createPatient(payload: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string;
  email: string;
  phone: string;
}): Promise<Patient> {
  const data = await fetchJson<any>("/api/patients", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapPatient(data);
}

export async function updatePatient(
  patientId: number,
  payload: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    sex?: string | null;
    email?: string;
    phone?: string;
    externalPatientCode?: string;
  }
): Promise<Patient> {
  const data = await fetchJson<any>(`/api/patients/${patientId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapPatient(data);
}

export async function deactivatePatient(patientId: number): Promise<void> {
  await fetchJson(`/api/patients/${patientId}`, {
    method: "DELETE",
  });
}

export async function getPatientEncounters(patientId: number): Promise<Encounter[]> {
  const data = await fetchJson<any[]>(`/api/patients/${patientId}/encounters`);
  return asArray<any>(data).map(mapEncounter);
}

export async function createEncounter(payload: CreateEncounterInput): Promise<Encounter> {
  const data = await fetchJson<any>("/api/encounters", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapEncounter(data);
}

export async function getModels(): Promise<Model[]> {
  const data = await fetchJson<any[]>("/api/models");
  return asArray<any>(data).map(mapModel);
}

export async function getRiskAssessments(): Promise<RiskAssessment[]> {
  const data = await fetchJson<any[]>("/api/risk-assessments");
  return asArray<any>(data).map(mapRiskAssessment);
}

export async function getRiskAssessmentById(assessmentId: number): Promise<RiskAssessment> {
  const data = await fetchJson<any>(`/api/risk-assessments/${assessmentId}`);
  return mapRiskAssessment(data);
}

export async function updateRiskAssessmentReviewStatus(assessmentId: number, reviewStatus: "pending" | "reviewed") {
  return fetchJson<{ assessment_id: number; review_status: string; assessment_status: string }>(
    `/api/risk-assessments/${assessmentId}/review`,
    {
      method: "PATCH",
      body: JSON.stringify({ reviewStatus }),
    }
  );
}

export async function deleteRiskAssessment(assessmentId: number): Promise<void> {
  await fetchJson(`/api/risk-assessments/${assessmentId}`, {
    method: "DELETE",
  });
}

export async function getPatientRiskAssessments(patientId: number): Promise<RiskAssessment[]> {
  const data = await fetchJson<any[]>(`/api/patients/${patientId}/risk-assessments`);
  return asArray<any>(data).map(mapRiskAssessment);
}

export async function submitRiskAssessment(input: RiskAssessmentRequest): Promise<RiskAssessmentResponse> {
  const body = JSON.stringify({
    patientId: input.patientId,
    ...input.payload,
  });

  return fetchJson<RiskAssessmentResponse>("/api/risk-assessments", {
    method: "POST",
    body,
  });
}

export async function getAuditLogEntries(): Promise<AuditLogEntry[]> {
  const data = await fetchJson<any[]>("/api/audit-log");
  return asArray<any>(data).map(mapAuditLog);
}

export async function getUsers(): Promise<User[]> {
  const data = await fetchJson<any[]>("/api/users");
  return asArray<any>(data).map(mapUser);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const data = await fetchJson<any>("/api/dashboard/stats");
  return {
    activeModelAccuracy: Number(data.activeModelAccuracy ?? data.active_model_accuracy ?? 0),
  };
}

export async function createUser(payload: CreateUserInput): Promise<User> {
  const data = await fetchJson<any>("/api/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapUser(data);
}

export async function updateUser(userId: number, payload: UpdateUserInput): Promise<User> {
  const data = await fetchJson<any>(`/api/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return mapUser(data);
}

export async function deleteUser(userId: number): Promise<void> {
  await fetchJson(`/api/users/${userId}`, {
    method: "DELETE",
  });
}

export async function loginUser(username: string, password: string): Promise<any> {
  const data = await fetchJson<any>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  // Backend returns {token, user}
  return data;
}

export async function getCurrentUser(): Promise<any> {
  return fetchJson<any>("/api/auth/me");
}

export async function logoutUser(): Promise<void> {
  await fetchJson("/api/auth/logout", {
    method: "POST",
  });
}
