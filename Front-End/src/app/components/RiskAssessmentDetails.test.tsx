import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RiskAssessment } from "../api/types";

const auth = vi.hoisted(() => ({ role: "doctor" as string | null }));
const api = vi.hoisted(() => ({
  getRiskAssessmentById: vi.fn(),
  updateRiskAssessmentReviewStatus: vi.fn(),
  deleteRiskAssessment: vi.fn(),
  overrideRiskAssessment: vi.fn(),
}));
vi.mock("../api/client", () => api);
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: auth.role ? { userId: 1, role: auth.role } : null }) }));

import { RiskAssessmentDetails, inputText } from "./RiskAssessmentDetails";

function assessment(over: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    assessmentId: 41,
    encounterId: 1,
    patientId: 10,
    patientName: "Marisol Quill",
    externalPatientCode: "P-0010",
    patientSex: "female",
    patientAge: 66,
    modelId: 1,
    modelName: "CVD stacked pipeline",
    modelVersion: "2.4",
    probabilityCvd: 0.42,
    predictedLabel: "x",
    riskLevel: "medium",
    assessmentStatus: "complete",
    reviewStatus: "pending",
    recommendation: "Model recommendation text.",
    createdAt: "2026-10-01T10:00:00Z",
    heartRate: 72,
    inputs: { BPXOSY1: 168, BMXBMI: 24.5, SMQ020: "Yes", LBXGH: null },
    explanation: {
      missingInputs: ["LBXHSCRP"],
      contributions: [{ feature: "BPXOSY1", label: "Systolic BP", value: 168, reference: 120, delta: 0.08 }],
    },
    overrideRiskLevel: "high",
    overrideRecommendation: "Refer urgently.",
    overrideReason: "Family history",
    overriddenByUsername: "dr.lee",
    overriddenAt: "2026-10-02T08:00:00Z",
    effectiveRiskLevel: "high",
    effectiveRecommendation: "Refer urgently.",
    overrideHistory: [
      { riskLevel: "high", recommendation: "Refer urgently.", reason: "Family history", overriddenByUsername: "dr.lee", createdAt: "2026-10-02T08:00:00Z" },
      { riskLevel: null, recommendation: "Re-test in a week.", reason: "Lab repeat pending", overriddenByUsername: "dr.kim", createdAt: "2026-10-01T12:00:00Z" },
    ],
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/assessments/41"]}>
      <Routes>
        <Route path="/assessments/:assessmentId" element={<RiskAssessmentDetails />} />
        <Route path="/assessments" element={<div>assessments list</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RiskAssessmentDetails", () => {
  beforeEach(() => {
    auth.role = "doctor";
    api.getRiskAssessmentById.mockReset().mockResolvedValue(assessment());
    api.updateRiskAssessmentReviewStatus.mockReset();
    api.deleteRiskAssessment.mockReset();
  });

  it("shows model vs effective risk, the override history timeline and original recommendation", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Marisol Quill" })).toBeInTheDocument();
    expect(screen.getByText("42.0%")).toBeInTheDocument();
    expect(screen.getByText("medium risk")).toHaveAttribute("data-variant", "medium");
    expect(screen.getAllByText("high risk")[0]).toHaveAttribute("data-variant", "high");

    const history = screen.getByRole("list", { name: "Override history" });
    const items = within(history).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Family history");
    expect(items[1]).toHaveTextContent("Reason: Lab repeat pending");
    expect(items[1]).toHaveTextContent("dr.kim");
    expect(screen.getByText(/Model’s original recommendation/).closest("p")).toHaveTextContent("Model recommendation text.");
    expect(screen.getByRole("link", { name: "View heart on dashboard" })).toHaveAttribute("href", "/dashboard?assessment=41");
    expect(screen.getByText(/not an absolute risk/)).toBeInTheDocument();
  });

  it("lists inputs with labels, 'Not recorded' for nulls and the heart rate caveat", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Marisol Quill" });
    const sys = screen.getByText("Systolic BP (mmHg)").closest("div")!;
    expect(sys).toHaveTextContent("168");
    expect(screen.getByText("Smoker").closest("div")).toHaveTextContent("Yes");
    expect(screen.getByText("HbA1c (%)").closest("div")).toHaveTextContent("Not recorded");
    expect(screen.getByText("Sleep hours (weekday)").closest("div")).toHaveTextContent("Not recorded");
    expect(screen.getByText("Heart rate (not used by the model)").closest("div")).toHaveTextContent("72 bpm");
    expect(screen.getByText("Estimated inputs")).toBeInTheDocument();
  });

  it("lists clinicians without Delete, and shows no actions without a user", async () => {
    auth.role = "clinician";
    const first = renderPage();
    await screen.findByRole("heading", { name: "Marisol Quill" });
    expect(screen.getByRole("button", { name: "Override" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    first.unmount();
    auth.role = null;
    renderPage();
    await screen.findByRole("heading", { name: "Marisol Quill" });
    for (const name of ["Override", "Delete", "Sign off"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("keeps the history visible after the override was removed", async () => {
    api.getRiskAssessmentById.mockResolvedValue(
      assessment({
        overrideRiskLevel: null,
        overrideRecommendation: null,
        effectiveRiskLevel: "medium",
        effectiveRecommendation: "Model recommendation text.",
        overrideHistory: [{ riskLevel: null, recommendation: null, reason: "Cleared", overriddenByUsername: "dr.lee", createdAt: "2026-10-03T08:00:00Z" }],
      })
    );
    renderPage();
    const history = await screen.findByRole("list", { name: "Override history" });
    expect(history).toHaveTextContent("Override removed");
    expect(history).toHaveTextContent("Reason: Cleared");
  });

  it("labels the model recommendation and warns when only the level was overridden", async () => {
    api.getRiskAssessmentById.mockResolvedValue(
      assessment({ riskLevel: "medium", overrideRiskLevel: "high", overrideRecommendation: null, effectiveRiskLevel: "high", effectiveRecommendation: "Model recommendation text." }),
    );
    renderPage();
    expect(await screen.findByText("Model recommendation for medium risk")).toBeInTheDocument();
    expect(screen.getByText("Review: recommendation was written for the model's level.")).toBeInTheDocument();
  });

  it("hides Override, Delete and sign-off for auditors", async () => {
    auth.role = "auditor";
    renderPage();
    await screen.findByRole("heading", { name: "Marisol Quill" });
    expect(screen.queryByRole("button", { name: "Override" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign off" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Override history" })).toBeInTheDocument();
  });

  it("signs off with a comment and reloads", async () => {
    api.updateRiskAssessmentReviewStatus.mockResolvedValue({});
    const u = userEvent.setup();
    renderPage();
    await u.type(await screen.findByLabelText("Review comment (optional)"), "Looks right");
    api.getRiskAssessmentById.mockResolvedValue(assessment({ reviewStatus: "reviewed", reviewedByUsername: "dr.lee", reviewComment: "Looks right" }));
    await u.click(screen.getByRole("button", { name: "Sign off" }));
    expect(api.updateRiskAssessmentReviewStatus).toHaveBeenCalledWith(41, "reviewed", "Looks right");
    expect(await screen.findByText(/Signed off by dr.lee/)).toBeInTheDocument();
  });

  it("confirms deletion in an app modal", async () => {
    api.deleteRiskAssessment.mockResolvedValue(undefined);
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole("button", { name: "Delete" }));
    const dlg = screen.getByRole("dialog", { name: "Delete assessment?" });
    expect(dlg).toHaveTextContent("The assessment will be removed from all lists (kept in the audit trail).");
    expect(dlg).not.toHaveTextContent(/cannot be undone/);
    expect(dlg).toHaveTextContent("Marisol Quill · P-0010");
    await u.click(within(dlg).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteRiskAssessment).toHaveBeenCalledWith(41));
    expect(await screen.findByText("assessments list")).toBeInTheDocument();
  });

  it("inputText maps coded values and treats blanks as not recorded", () => {
    // real stored shape
    expect(inputText("SMQ020", "Yes")).toBe("Yes");
    expect(inputText("SMQ020", "   ")).toBeNull();
    expect(inputText("PAD790U", "  ")).toBeNull();
    expect(inputText("PAD790U", "W")).toBe("Week");
    expect(inputText("RIDRETH3", "Non-Hispanic Asian")).toBe("Non-Hispanic Asian");
    // legacy numeric codes
    expect(inputText("PAD790U", 2)).toBe("Week");
    expect(inputText("DIQ010", 9)).toBe("Unknown (9)");
    expect(inputText("RIDRETH3", 5)).toBe("Unknown (5)");
    expect(inputText("DIQ010", "3.0")).toBe("Borderline");
    expect(inputText("RIDRETH3", 6)).toBe("Non-Hispanic Asian");
    expect(inputText("BMXBMI", 27.456)).toBe("27.46");
    expect(inputText("BMXBMI", null)).toBeNull();
    expect(inputText("BMXBMI", "")).toBeNull();
  });
});

describe("RiskAssessmentDetails not found", () => {
  it("shows 'not found' for a 404 and an error with retry otherwise", async () => {
    const { ApiError } = await import("../api/errors");
    api.getRiskAssessmentById.mockReset().mockRejectedValue(new ApiError({ status: 404, message: "Not found" }));
    const first = renderPage();
    expect(await screen.findByRole("heading", { name: "Risk assessment not found" })).toBeInTheDocument();
    first.unmount();

    api.getRiskAssessmentById.mockReset().mockRejectedValue(new ApiError({ status: 500, message: "boom" }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this assessment.");
  });
});
