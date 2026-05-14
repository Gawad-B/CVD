import { Suspense, lazy, type ComponentType, type ReactNode } from "react";
import { Navigate, createBrowserRouter, useLocation } from "react-router";
import { Layout } from "./components/Layout";
import { RootLayout } from "./components/RootLayout";
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

const Login = lazy(() => import("./components/Login").then((module) => ({ default: module.Login })));
const Dashboard = lazy(() => import("./components/Dashboard").then((module) => ({ default: module.Dashboard })));
const PatientsList = lazy(() => import("./components/PatientsList").then((module) => ({ default: module.PatientsList })));
const PatientDetails = lazy(() => import("./components/PatientDetails").then((module) => ({ default: module.PatientDetails })));
const RiskAssessmentForm = lazy(
  () => import("./components/RiskAssessmentForm").then((module) => ({ default: module.RiskAssessmentForm }))
);
const RiskAssessmentsList = lazy(
  () => import("./components/RiskAssessmentsList").then((module) => ({ default: module.RiskAssessmentsList }))
);
const RiskAssessmentDetails = lazy(
  () => import("./components/RiskAssessmentDetails").then((module) => ({ default: module.RiskAssessmentDetails }))
);
const ModelRegistry = lazy(() => import("./components/ModelRegistry").then((module) => ({ default: module.ModelRegistry })));
const AuditLog = lazy(() => import("./components/AuditLog").then((module) => ({ default: module.AuditLog })));
const UserManagement = lazy(
  () => import("./components/UserManagement").then((module) => ({ default: module.UserManagement }))
);
const Forbidden = lazy(() => import("./components/Forbidden").then((module) => ({ default: module.Forbidden })));

function RouteLoadingFallback() {
  return <div className="p-6 text-sm text-gray-600">Loading page...</div>;
}

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
          <Suspense fallback={<RouteLoadingFallback />}>
            <Component />
          </Suspense>
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
      <Suspense fallback={<RouteLoadingFallback />}>
        <Login />
      </Suspense>
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
