import { createBrowserRouter } from "react-router";
import { AuthProvider } from "./context/AuthContext";
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

export const router = createBrowserRouter([
  {
    Component: RootLayout,
    children: [
      {
        path: "/login",
        Component: Login,
      },
      {
        path: "/",
        Component: Layout,
        children: [
          { index: true, Component: Dashboard },
          { path: "patients", Component: PatientsList },
          { path: "patients/:patientId", Component: PatientDetails },
          { path: "patients/:patientId/assess", Component: RiskAssessmentForm },
          { path: "assessments", Component: RiskAssessmentsList },
          { path: "assessments/:assessmentId", Component: RiskAssessmentDetails },
          { path: "models", Component: ModelRegistry },
          { path: "audit", Component: AuditLog },
          { path: "users", Component: UserManagement },
        ],
      },
    ],
  },
]);
