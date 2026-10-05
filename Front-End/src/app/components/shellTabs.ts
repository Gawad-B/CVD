import {
  ALL_ROLES,
  AUDIT_ROLES,
  MODELS_ROLES,
  PATIENTS_ROLES,
  USER_MANAGEMENT_ROLES,
  hasRoleAccess,
  type Role,
} from "../auth/permissions";

export interface ShellTab {
  label: string;
  to: string;
  roles: readonly Role[];
}

export const SHELL_TABS: readonly ShellTab[] = [
  { label: "Dashboard", to: "/dashboard", roles: ALL_ROLES },
  { label: "Patients", to: "/patients", roles: PATIENTS_ROLES },
  { label: "Assessments", to: "/assessments", roles: ALL_ROLES },
  { label: "Models", to: "/models", roles: MODELS_ROLES },
  { label: "Users", to: "/users", roles: USER_MANAGEMENT_ROLES },
  { label: "Audit log", to: "/audit", roles: AUDIT_ROLES },
];

export function shellTabsForRole(role: Role | null | undefined): ShellTab[] {
  return SHELL_TABS.filter((tab) => hasRoleAccess(role, tab.roles));
}
