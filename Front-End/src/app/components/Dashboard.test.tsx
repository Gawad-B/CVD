import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RiskAssessment, User } from "../api/types";

const auth = vi.hoisted(() => ({ user: { role: "doctor" } as unknown }));
const api = vi.hoisted(() => ({
  getRiskAssessments: vi.fn(),
  getRiskAssessmentById: vi.fn(),
  getDashboardStats: vi.fn(),
  getModels: vi.fn(),
  updateRiskAssessmentReviewStatus: vi.fn(),
  overrideRiskAssessment: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock("../api/client", () => api);
vi.mock("../heart", async (orig) => ({
  ...(await orig<typeof import("../heart")>()),
  LazyHeart3D: ({ risk, bpm }: { risk: string; bpm: number }) => <div data-testid="heart3d" data-risk={risk} data-bpm={bpm} />,
}));

import { SearchProvider, useSearch } from "../context/SearchContext";
import { Dashboard } from "./Dashboard";

function assessment(over: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    assessmentId: 1,
    encounterId: 1,
    patientId: 10,
    patientName: "Marisol Quill",
    externalPatientCode: "P-0010",
    patientSex: "female",
    patientAge: 66,
    modelId: 1,
    modelName: "Gradient boosting",
    probabilityCvd: 0.42,
    predictedLabel: "x",
    riskLevel: "medium",
    assessmentStatus: "complete",
    reviewStatus: "pending",
    recommendation: "Model recommendation text.",
    createdAt: "2026-10-01T10:00:00Z",
    heartRate: null,
    inputs: { BPXOSY1: 168, BPXODI1: 90, LBXTC: 250, LBDHDD: 52, BMXBMI: 24.5, RIAGENDR: "2.0", RIDAGEYR: 66 },
    explanation: {
      missingInputs: [],
      contributions: [
        { feature: "BPXOSY1", label: "Systolic BP", value: 168, reference: 120, delta: 0.08 },
        { feature: "LBXTC", label: "Total cholesterol", value: 250, reference: 190, delta: -0.02 },
      ],
    },
    effectiveRiskLevel: "medium",
    effectiveRecommendation: "Model recommendation text.",
    ...over,
  };
}

const second = assessment({
  assessmentId: 2,
  patientId: 11,
  patientName: "Alder Fennimore",
  externalPatientCode: "P-0011",
  patientSex: "male",
  patientAge: 79,
  riskLevel: "high",
  effectiveRiskLevel: "high",
  probabilityCvd: 0.81,
  heartRate: 82,
  recommendation: "Refer now.",
  effectiveRecommendation: "Refer now.",
});

function Location() {
  const l = useLocation();
  return <output data-testid="loc">{l.pathname + l.search}</output>;
}

function SearchBox() {
  const { setQuery } = useSearch();
  return <input aria-label="q" onChange={(e) => setQuery(e.target.value)} />;
}

function renderDashboard(url = "/dashboard", role: User["role"] = "doctor") {
  auth.user = { role };
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SearchProvider>
        <SearchBox />
        <Location />
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/assessments" element={<p>assessments page</p>} />
        </Routes>
      </SearchProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.getRiskAssessments.mockResolvedValue([assessment(), second]);
  api.getRiskAssessmentById.mockImplementation(async (id: number) => (id === 2 ? second : assessment()));
  api.getDashboardStats.mockResolvedValue({
    totalPatients: 1284,
    totalAssessments: 3912,
    riskDistribution: { low: 2386, medium: 1054, high: 472 },
    activeModelAccuracy: 0.8,
    pendingReview: 38,
    highRisk: 472,
    recentAssessments: [],
  });
  api.getModels.mockResolvedValue([
    { modelId: 1, modelName: "Gradient boosting", modelVersion: "2.4", isActive: true, auc: 0.886, recall: 0.88, precision: 0.81, accuracy: 0.8, f1Score: 0.8, algorithm: "gb", useCase: "x", trainedAt: "" },
  ]);
});

describe("Dashboard", () => {
  it("renders the stats and active model", async () => {
    renderDashboard();
    expect(await screen.findByText("1,284")).toBeInTheDocument();
    expect(screen.getByText("3,912")).toBeInTheDocument();
    expect(screen.getByText("38")).toBeInTheDocument();
    expect(screen.getByText("Gradient boosting v2.4")).toBeInTheDocument();
    expect(screen.getByText("0.886")).toBeInTheDocument();
    expect(screen.getByText("Low 2,386")).toBeInTheDocument();
  });

  it("shows vitals with abnormal values highlighted and patient meta", async () => {
    renderDashboard();
    const bp = await screen.findByText("168/90");
    expect(bp).toHaveAttribute("data-abnormal", "true");
    expect(bp.parentElement).toHaveTextContent("(above threshold)");
    expect(screen.getByText("250")).toHaveAttribute("data-abnormal", "true");
    expect(screen.getByText("52")).not.toHaveAttribute("data-abnormal");
    expect(await screen.findByText("Female, 66")).toBeInTheDocument();
  });

  it("selecting a patient updates the stage and the URL", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("Medium risk");
    await user.click(screen.getByRole("button", { name: /Alder Fennimore/ }));
    await waitFor(() => expect(screen.getByTestId("heart3d")).toHaveAttribute("data-risk", "high"));
    expect(screen.getByTestId("loc")).toHaveTextContent("/dashboard?assessment=2");
    expect(screen.getByText("81.0%")).toBeInTheDocument();
  });

  it("preselects ?assessment=<id>", async () => {
    renderDashboard("/dashboard?assessment=2");
    await waitFor(() => expect(screen.getByTestId("heart3d")).toHaveAttribute("data-risk", "high"));
    expect(api.getRiskAssessmentById).toHaveBeenCalledWith(2);
    expect(screen.getByRole("button", { name: /Alder Fennimore/ })).toHaveAttribute("aria-current", "true");
  });

  it("filters the recent list by the shell search", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("button", { name: /Alder Fennimore/ });
    await user.type(screen.getByLabelText("q"), "P-0011");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Marisol Quill/ })).not.toBeInTheDocument());
    await user.clear(screen.getByLabelText("q"));
    await user.type(screen.getByLabelText("q"), "zzz");
    expect(await screen.findByText("No patients match that search.")).toBeInTheDocument();
  });

  it("shows the measured heart rate only when recorded", async () => {
    renderDashboard("/dashboard?assessment=2");
    expect(await screen.findByText(/82 bpm · measured/)).toBeInTheDocument();
    expect(screen.queryByText("Illustration of risk level — not patient data")).not.toBeInTheDocument();
    expect(screen.getByTestId("heart3d")).toHaveAttribute("data-bpm", "82");
  });

  it("shows no bpm number and an illustration label when not measured", async () => {
    renderDashboard("/dashboard?assessment=1");
    expect(await screen.findByText("Illustration of risk level — not patient data")).toBeInTheDocument();
    expect(screen.queryByText(/\bbpm ·/)).not.toBeInTheDocument();
    expect(screen.getByText("ECG · illustration")).toBeInTheDocument();
    expect(screen.getByText(/this is not an absolute risk/)).toBeInTheDocument();
  });

  it("shows counterfactual factor wording and relative bars", async () => {
    renderDashboard();
    expect(
      await screen.findByText(
        "Systolic BP: 168 (typical: 120) — model estimate 8.0 percentage points higher than with the typical value",
      ),
    ).toBeInTheDocument();
    const bars = screen.getAllByTestId("factor-bar");
    expect(bars[0]).toHaveStyle({ width: "100%" });
    expect(bars[1]).toHaveStyle({ width: "25%" });
    expect(screen.getByText(/Not a measure of clinical risk-factor importance/)).toBeInTheDocument();
  });

  it("shows 'Factor explanation unavailable.' when the explanation failed", async () => {
    api.getRiskAssessmentById.mockResolvedValue(
      assessment({ explanation: { missingInputs: [], contributions: [], explanationError: true } }),
    );
    renderDashboard();
    expect(await screen.findByText("Factor explanation unavailable.")).toBeInTheDocument();
  });

  it("override sends only the changed fields plus the reason, then refreshes", async () => {
    const user = userEvent.setup();
    api.overrideRiskAssessment.mockResolvedValue({ assessmentId: 1, reviewStatus: "pending" });
    api.getRiskAssessmentById.mockResolvedValue(assessment({ reviewStatus: "reviewed" }));
    renderDashboard();
    await screen.findByText("Medium risk");
    await user.click(screen.getByRole("button", { name: "Override" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Risk level"), "high");
    await user.click(within(dialog).getByRole("checkbox", { name: /Keep the model's recommendation text/ }));
    await user.type(within(dialog).getByLabelText(/Reason/), "abc");
    await user.click(within(dialog).getByRole("button", { name: "Save override" }));
    expect(within(dialog).getByText("Enter a reason of 5 to 2000 characters.")).toBeInTheDocument();
    expect(api.overrideRiskAssessment).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/Reason/), "de clinical judgement");
    await user.click(within(dialog).getByRole("button", { name: "Save override" }));
    await waitFor(() =>
      expect(api.overrideRiskAssessment).toHaveBeenCalledWith(1, { riskLevel: "high", reason: "abcde clinical judgement" }),
    );
    expect(await screen.findByText(/returned to “Pending review”/)).toBeInTheDocument();
    expect(api.getDashboardStats.mock.calls.length).toBeGreaterThan(1);
  });

  it("links the recommendation card to the full assessment details", async () => {
    renderDashboard();
    expect(await screen.findByRole("link", { name: "Full details" })).toHaveAttribute("href", "/assessments/1");
  });

  it("sign off calls the review endpoint and becomes disabled once reviewed", async () => {
    const user = userEvent.setup();
    api.updateRiskAssessmentReviewStatus.mockResolvedValue({});
    renderDashboard();
    const button = await screen.findByRole("button", { name: "Sign off" });
    api.getRiskAssessmentById.mockResolvedValue(assessment({ reviewStatus: "reviewed", reviewedByUsername: "doc" }));
    await user.click(button);
    await waitFor(() => expect(api.updateRiskAssessmentReviewStatus).toHaveBeenCalledWith(1, "reviewed", undefined));
    expect(await screen.findByRole("button", { name: "Signed off" })).toBeDisabled();
  });

  it("hides sign off and override for auditors", async () => {
    renderDashboard("/dashboard", "auditor");
    await screen.findByText("Medium risk");
    expect(screen.queryByRole("button", { name: /Sign off|Signed off/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Override" })).not.toBeInTheDocument();
    expect(api.getModels).not.toHaveBeenCalled();
  });

  it("never calls getPatients (no patient-list reads, so no false denied audit rows for auditors)", async () => {
    renderDashboard("/dashboard", "auditor");
    await screen.findByText("Medium risk");
    expect(Object.keys(api)).not.toContain("getPatients");
    expect(await screen.findByText("Female, 66")).toBeInTheDocument();
  });

  it("pins the default selection into the URL and keeps it after a list refresh", async () => {
    const user = userEvent.setup();
    api.updateRiskAssessmentReviewStatus.mockResolvedValue({});
    renderDashboard();
    await screen.findByText("Medium risk");
    await waitFor(() => expect(screen.getByTestId("loc")).toHaveTextContent("/dashboard?assessment=1"));
    const newest = assessment({ assessmentId: 3, patientId: 12, patientName: "New Person" });
    api.getRiskAssessments.mockResolvedValue([newest, assessment(), second]);
    await user.click(screen.getByRole("button", { name: "Sign off" }));
    await waitFor(() => expect(api.getRiskAssessments.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /New Person/ })).toBeInTheDocument());
    expect(screen.getByTestId("loc")).toHaveTextContent("/dashboard?assessment=1");
  });

  it("override: choosing the level already in effect counts as unchanged; level-only change shows a hint", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("Medium risk");
    await user.click(screen.getByRole("button", { name: "Override" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Keep current (Medium)")).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Risk level"), "medium");
    await user.type(within(dialog).getByLabelText(/Reason/), "some reason");
    await user.click(within(dialog).getByRole("button", { name: "Save override" }));
    expect(within(dialog).getByText("Change the risk level or the recommendation before saving.")).toBeInTheDocument();
    expect(api.overrideRiskAssessment).not.toHaveBeenCalled();
    await user.selectOptions(within(dialog).getByLabelText("Risk level"), "high");
    expect(within(dialog).getByText(/Edit the recommendation for the new level/)).toBeInTheDocument();
  });

  it("override: a level change with unchanged text needs a new text or the keep checkbox", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("Medium risk");
    await user.click(screen.getByRole("button", { name: "Override" }));
    const dialog = screen.getByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save override" });
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Risk level"), "high");
    const keep = within(dialog).getByRole("checkbox", { name: /written for medium risk/ });
    expect(save).toBeDisabled();
    await user.click(keep);
    expect(save).toBeEnabled();
    await user.click(keep);
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Recommendation"), " Urgent referral.");
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(save).toBeEnabled();
  });

  it("override: names the patient and resets the keep-text checkbox when the level changes", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("Medium risk");
    await user.click(screen.getByRole("button", { name: "Override" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Marisol Quill · P-0010")).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Risk level"), "high");
    await user.click(within(dialog).getByRole("checkbox", { name: /written for medium risk/ }));
    expect(within(dialog).getByRole("checkbox")).toBeChecked();
    await user.selectOptions(within(dialog).getByLabelText("Risk level"), "low");
    expect(within(dialog).getByRole("checkbox")).not.toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Save override" })).toBeDisabled();
  });

  it("override: when an override recommendation exists the keep label names that source and level", async () => {
    api.getRiskAssessmentById.mockResolvedValue(
      assessment({
        riskLevel: "low",
        overrideRiskLevel: "medium",
        effectiveRiskLevel: "medium",
        overrideRecommendation: "Repeat labs.",
        effectiveRecommendation: "Repeat labs.",
      }),
    );
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText("Medium risk");
    await user.click(screen.getByRole("button", { name: "Override" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Risk level"), "high");
    expect(
      within(dialog).getByRole("checkbox", { name: "Keep the current override recommendation (written for medium risk)" }),
    ).toBeInTheDocument();
  });

  it("labels the model recommendation and warns when only the level was overridden", async () => {
    api.getRiskAssessmentById.mockResolvedValue(
      assessment({ riskLevel: "low", overrideRiskLevel: "high", effectiveRiskLevel: "high", overrideRecommendation: null }),
    );
    renderDashboard();
    expect(await screen.findByText("Model recommendation for low risk")).toBeInTheDocument();
    expect(screen.getByText("Review: recommendation was written for the model's level.")).toBeInTheDocument();
  });

  it("shows the empty state with a link to assessments", async () => {
    api.getRiskAssessments.mockResolvedValue([]);
    renderDashboard();
    expect(await screen.findByText("No assessments yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Assessments" })).toHaveAttribute("href", "/assessments");
  });

  it("shows an error with retry when assessments fail to load", async () => {
    const user = userEvent.setup();
    api.getRiskAssessments.mockRejectedValueOnce(new Error("boom"));
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Medium risk")).toBeInTheDocument();
  });
});
