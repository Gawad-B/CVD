import type { User } from "../api/types";

export type Role = User["role"];

export const ALL_ROLES: readonly Role[] = ["admin", "doctor", "clinician", "auditor"];
export const PATIENTS_ROLES: readonly Role[] = ["admin", "doctor", "clinician"];
export const MODELS_ROLES: readonly Role[] = ["admin", "doctor"];
export const AUDIT_ROLES: readonly Role[] = ["admin", "auditor"];
export const USER_MANAGEMENT_ROLES: readonly Role[] = ["admin"];

export function hasRoleAccess(role: Role | null | undefined, allowedRoles: readonly Role[]): boolean {
  return Boolean(role && allowedRoles.includes(role));
}
