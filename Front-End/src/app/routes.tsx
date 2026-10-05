import { Suspense, lazy, type ComponentType, type ReactNode } from "react";
import { Navigate, createBrowserRouter, useLocation, useParams } from "react-router";
import { AppShell } from "./components/AppShell";
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

const LandingPage = lazy(
  () => import("./landing/LandingPage").then((module) => ({ default: module.LandingPage }))
);
const Login = lazy(() => import("./components/Login").then((module) => ({ default: module.Login })));
const Dashboard = lazy(() => import("./components/Dashboard").then((module) => ({ default: module.Dashboard })));
const PatientsList = lazy(() => import("./components/PatientsList").then((module) => ({ default: module.PatientsList })));
const PatientDetails = lazy(() => import("./components/PatientDetails").then((module) => ({ default: module.PatientDetails })));
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
  return (
    <div role="status" className="p-6 text-sm text-[#5b6b85]">
      Loading page...
    </div>
  );
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
    return <Navigate to="/dashboard" replace />;
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
      <AppShell />
    </RequireAuth>
  );
}

/** Old deep link: the assessment form now lives on /assessments with the patient preselected. */
function AssessRedirect() {
  const { patientId } = useParams();
  return <Navigate to={`/assessments?patient=${encodeURIComponent(patientId ?? "")}`} replace />;
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

function LandingRoute() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <LandingPage />
    </Suspense>
  );
}

export const appRoutes = [
  {
    Component: RootLayout,
    children: [
      { path: "/", Component: LandingRoute },
      { path: "/login", Component: LoginRoute },
      {
        Component: ProtectedLayout,
        children: [
          { path: "/dashboard", Component: withGuards(Dashboard, ALL_ROLES) },
          { path: "/patients", Component: withGuards(PatientsList, PATIENTS_ROLES) },
          { path: "/patients/:patientId", Component: withGuards(PatientDetails, PATIENTS_ROLES) },
          { path: "/patients/:patientId/assess", Component: withGuards(AssessRedirect, PATIENTS_ROLES) },
          { path: "/assessments", Component: withGuards(RiskAssessmentsList, ALL_ROLES) },
          { path: "/assessments/:assessmentId", Component: withGuards(RiskAssessmentDetails, ALL_ROLES) },
          { path: "/models", Component: withGuards(ModelRegistry, MODELS_ROLES) },
          { path: "/users", Component: withGuards(UserManagement, USER_MANAGEMENT_ROLES) },
          { path: "/audit", Component: withGuards(AuditLog, AUDIT_ROLES) },
          { path: "/forbidden", Component: Forbidden },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
