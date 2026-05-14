import type { ComponentType, ReactNode } from "react";
import { Navigate, createBrowserRouter, useLocation } from "react-router";
import { Layout } from "./components/Layout";
import { Login } from "./components/Login";
import { Dashboard } from "./components/Dashboard";
import { PatientsList } from "./components/PatientsList";
import { PatientDetails } from "./components/PatientDetails";
import { RiskAssessmentForm } from "./components/RiskAssessmentForm";
import { RiskAssessmentsList } from "./components/RiskAssessmentsList";
import { RiskAssessmentDetails } from "./components/RiskAssessmentDetails";
import { ModelRegistry } from "./components/ModelRegistry";
import { AuditLog } from "./components/AuditLog";
import { UserManagement } from "./components/UserManagement";
import { RootLayout } from "./components/RootLayout";
import { Forbidden } from "./components/Forbidden";
import { useAuth } from "./context/AuthContext";
import {
  ALL_ROLES,
  AUDIT_ROLES,
  MODELS_ROLES,
  PATIENTS_ROLES,
  USER_MANAGEMENT_ROLES,
  hasRoleAccess,
  type Role,
} from "./auth/permissions";

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function RequireRole({ children, roles }: { children: ReactNode; roles: readonly Role[] }) {
  const { user } = useAuth();
  if (!hasRoleAccess(user?.role, roles)) {
    return <Navigate to="/forbidden" replace />;
  }
  return <>{children}</>;
}

function withGuards(Component: ComponentType, roles: readonly Role[]) {
  return function GuardedComponent() {
    return (
      <RequireAuth>
        <RequireRole roles={roles}>
          <Component />
        </RequireRole>
      </RequireAuth>
    );
  };
}

function ProtectedLayout() {
  return (
    <RequireAuth>
      <Layout />
    </RequireAuth>
  );
}

function LoginRoute() {
  return (
    <GuestOnly>
      <Login />
    </GuestOnly>
  );
}

export const router = createBrowserRouter([
  {
    Component: RootLayout,
    children: [
      {
        path: "/login",
        Component: LoginRoute,
      },
      {
        path: "/forbidden",
        Component: ProtectedLayout,
        children: [{ index: true, Component: Forbidden }],
      },
      {
        path: "/",
        Component: ProtectedLayout,
        children: [
          { index: true, Component: withGuards(Dashboard, ALL_ROLES) },
          { path: "patients", Component: withGuards(PatientsList, PATIENTS_ROLES) },
          { path: "patients/:patientId", Component: withGuards(PatientDetails, PATIENTS_ROLES) },
          { path: "patients/:patientId/assess", Component: withGuards(RiskAssessmentForm, PATIENTS_ROLES) },
          { path: "assessments", Component: withGuards(RiskAssessmentsList, ALL_ROLES) },
          { path: "assessments/:assessmentId", Component: withGuards(RiskAssessmentDetails, ALL_ROLES) },
          { path: "models", Component: withGuards(ModelRegistry, MODELS_ROLES) },
          { path: "audit", Component: withGuards(AuditLog, AUDIT_ROLES) },
          { path: "users", Component: withGuards(UserManagement, USER_MANAGEMENT_ROLES) },
        ],
      },
    ],
  },
]);
