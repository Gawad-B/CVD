import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Patient, RiskAssessment } from "../api/types";

const auth = vi.hoisted(() => ({ user: { role: "doctor" } as unknown }));
const api = vi.hoisted(() => ({
  getPatients: vi.fn(),
  getRiskAssessments: vi.fn(),
  submitRiskAssessment: vi.fn(),
}));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock("../api/client", () => api);

import { RiskAssessmentsList } from "./RiskAssessmentsList";

function patient(over: Partial<Patient> = {}): Patient {
  return {
    patientId: 10,
    externalPatientCode: "P-0010",
    sex: "female",
    firstName: "Marisol",
    lastName: "Quill",
    dateOfBirth: "1960-01-15",
    phone: "",
    email: "",
    createdAt: "2026-09-01T00:00:00Z",
    lastAssessment: null,
    ...over,
  };
}

function assessment(over: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    assessmentId: 1,
    encounterId: 1,
    patientId: 10,
    patientName: "Marisol Quill",
    externalPatientCode: "P-0010",
    modelId: 1,
    modelName: "m",
    probabilityCvd: 0.2,
    predictedLabel: "x",
    riskLevel: "low",
    assessmentStatus: "complete",
    reviewStatus: "pending",
    recommendation: "r",
    createdAt: "2026-10-01T10:00:00Z",
    effectiveRiskLevel: "low",
    effectiveRecommendation: "r",
    ...over,
  };
}

const list = [
  assessment({ assessmentId: 1, patientName: "Marisol Quill", probabilityCvd: 0.2, riskLevel: "low", effectiveRiskLevel: "low" }),
  // Model said low but a clinician overrode to high: filters use the effective level.
  assessment({
    assessmentId: 2,
    patientName: "Alder Fennimore",
    externalPatientCode: "P-0011",
    probabilityCvd: 0.25,
    riskLevel: "low",
    effectiveRiskLevel: "high",
    reviewStatus: "reviewed",
  }),
  assessment({ assessmentId: 3, patientName: "Wren Oakes", externalPatientCode: "P-0012", probabilityCvd: 0.5, riskLevel: "medium", effectiveRiskLevel: "medium" }),
];

function Where() {
  const l = useLocation();
  return <output data-testid="loc">{l.pathname + l.search}</output>;
}

function renderPage(url = "/assessments") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/assessments" element={<RiskAssessmentsList />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillCompact(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("BMI (kg/m²)"), "27.5");
  await user.type(screen.getByLabelText("Systolic BP (mmHg)"), "128");
  await user.type(screen.getByLabelText("Diastolic BP (mmHg)"), "82");
  await user.selectOptions(screen.getByLabelText("History of high BP"), "no");
  await user.type(screen.getByLabelText("Total cholesterol (mg/dL)"), "190");
  await user.type(screen.getByLabelText("HDL (mg/dL)"), "52");
  await user.type(screen.getByLabelText("Triglycerides (mg/dL)"), "140");
  await user.selectOptions(screen.getByLabelText("History of high cholesterol"), "no");
  await user.selectOptions(screen.getByLabelText("On cholesterol-lowering medication"), "no");
  await user.type(screen.getByLabelText("Creatinine (mg/dL)"), "0.9");
  await user.type(screen.getByLabelText("HbA1c (%)"), "5.6");
  await user.selectOptions(screen.getByLabelText("Diabetic"), "no");
  await user.selectOptions(screen.getByLabelText("Ever smoked (100+ cigarettes)"), "no");
  await user.selectOptions(screen.getByLabelText("Self-rated general health"), "2");
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await fillCompact(user);
  await user.type(screen.getByLabelText("Heart rate (bpm)"), "72");
}

beforeEach(() => {
  auth.user = { role: "doctor" };
  api.getPatients.mockReset().mockResolvedValue([patient(), patient({ patientId: 11, firstName: "Alder", lastName: "Fennimore", externalPatientCode: "P-0011", dateOfBirth: "1985-06-30" })]);
  api.getRiskAssessments.mockReset().mockResolvedValue(list);
  api.submitRiskAssessment.mockReset();
});

describe("Assessments: past list", () => {
  it("lists rows with code, date, review state, score and effective badge", async () => {
    renderPage();
    const row = (await screen.findByText("Alder Fennimore")).closest("a")!;
    expect(row).toHaveAttribute("href", "/dashboard?assessment=2");
    expect(within(row).getByText("P-0011 · 1 Oct 2026 · Signed off")).toBeInTheDocument();
    expect(within(row).getByText("From screening model")).toBeInTheDocument();
    expect(within(row).getByText("high")).toHaveAttribute("data-variant", "high");
    expect(within(screen.getByText("Marisol Quill").closest("a")!).getByText(/Pending review/)).toBeInTheDocument();
  });

  it("filters by effective risk level and shows the empty state", async () => {
    renderPage();
    await screen.findByText("Alder Fennimore");
    const filter = screen.getByRole("group", { name: "Filter by risk level" });

    await userEvent.click(within(filter).getByRole("button", { name: "High" }));
    expect(screen.getByText("Alder Fennimore")).toBeInTheDocument(); // model "low", effective "high"
    expect(screen.queryByText("Marisol Quill")).not.toBeInTheDocument();

    await userEvent.click(within(filter).getByRole("button", { name: "Medium" }));
    expect(screen.getByText("Wren Oakes")).toBeInTheDocument();
    expect(screen.queryByText("Alder Fennimore")).not.toBeInTheDocument();

  });

  it("says so when no assessment has the chosen level", async () => {
    api.getRiskAssessments.mockResolvedValue([list[0]]);
    renderPage();
    await screen.findByText("Marisol Quill");
    await userEvent.click(screen.getByRole("button", { name: "High" }));
    expect(screen.getByText("No assessments at this risk level.")).toBeInTheDocument();
  });

  it("gives each row a separate Details link to the assessment page", async () => {
    renderPage();
    await screen.findByText("Wren Oakes");
    expect(screen.getByRole("link", { name: "Details for Wren Oakes" })).toHaveAttribute("href", "/assessments/3");
    expect(screen.getAllByRole("link", { name: /^Details for/ })).toHaveLength(3);
  });

  it("navigates a row to the dashboard with that assessment selected", async () => {
    renderPage();
    await userEvent.click((await screen.findByText("Wren Oakes")).closest("a")!);
    expect(screen.getByTestId("loc")).toHaveTextContent("/dashboard?assessment=3");
  });
});

describe("Assessments: new assessment form", () => {
  it("preselects the patient from ?patient= and derives age from the date of birth", async () => {
    renderPage("/assessments?patient=11");
    const select = (await screen.findByLabelText("Patient")) as HTMLSelectElement;
    expect(select.value).toBe("11");
    const age = screen.getByLabelText("Age") as HTMLInputElement;
    expect(age).toHaveAttribute("readonly");
    expect(Number(age.value)).toBeGreaterThanOrEqual(40);
  });

  it("hides the form for auditors and never lists patients", async () => {
    auth.user = { role: "auditor" };
    renderPage();
    await screen.findByText("Marisol Quill");
    expect(screen.queryByText("New assessment")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run assessment" })).not.toBeInTheDocument();
    expect(api.getPatients).not.toHaveBeenCalled();
  });

  it("asks for a patient and the required fields before calling the API", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Run assessment" }));
    expect(screen.getByText("Select a patient.")).toBeInTheDocument();
    expect(screen.getAllByText("Required.")).toHaveLength(9);
    expect(screen.getAllByText("Choose an option.")).toHaveLength(6);
    expect(screen.getByLabelText("Patient")).toHaveFocus();
    expect(api.submitRiskAssessment).not.toHaveBeenCalled();
  });

  it("toggles the Optional inputs disclosure with every other input", async () => {
    renderPage();
    const toggle = await screen.findByRole("button", { name: "Optional inputs" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Sodium (mmol/L)")).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const label of ["Waist (cm)", "Sodium (mmol/L)", "Urine albumin/creatinine (mg/g)", "Sleep, weekday (hours)", "Clinical notes"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    const race = screen.getByLabelText("Race/ethnicity") as HTMLSelectElement;
    expect(race.value).toBe("");
    expect(within(race).getByRole("option", { name: "Not recorded" })).toBeInTheDocument();
    expect(screen.getByLabelText("Sodium (mmol/L)")).toHaveAttribute("min", "110");
    expect(screen.getByLabelText("Sodium (mmol/L)")).toHaveAttribute("max", "170");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Sodium (mmol/L)")).not.toBeInTheDocument();
  });

  it("requires heart rate and sends it as an integer", async () => {
    const user = userEvent.setup();
    api.submitRiskAssessment.mockResolvedValue({ probability: 0.3, riskLevel: "low", recommendation: "ok", assessmentId: 77 });
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await fillCompact(user);

    await user.click(screen.getByRole("button", { name: "Run assessment" }));
    expect(screen.getByLabelText("Heart rate (bpm)")).toHaveAccessibleDescription(/Required\./);
    expect(api.submitRiskAssessment).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Heart rate (bpm)"), "72");
    await user.click(screen.getByRole("button", { name: "Run assessment" }));
    await waitFor(() => expect(api.submitRiskAssessment).toHaveBeenCalledTimes(1));
    const first = api.submitRiskAssessment.mock.calls[0][0];
    expect(first.patientId).toBe(10);
    expect(first.payload).toMatchObject({ bmi: 27.5, systolicBp: 128, diastolicBp: 82, smoker: "no", smokesNow: "no", highBp: "no", bpMed: "no", totalCholesterol: 190, hdl: 52, triglycerides: 140, creatinine: 0.9, hba1cPercent: 5.6, diabetic: "no", generalHealth: 2 });
    expect(first.payload.waistCm).toBeUndefined();
    expect(first.payload.age).toBeGreaterThanOrEqual(60);
    expect(first.payload.heartRate).toBe(72);
    expect(Number.isInteger(first.payload.heartRate)).toBe(true);
  });

  it("rejects a fractional or out-of-range heart rate client-side", async () => {
    const user = userEvent.setup();
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await fillCompact(user);
    await user.type(screen.getByLabelText("Heart rate (bpm)"), "250");
    await user.click(screen.getByRole("button", { name: "Run assessment" }));
    expect(screen.getByText(/whole number between 30 and 220/)).toBeInTheDocument();
    expect(api.submitRiskAssessment).not.toHaveBeenCalled();
  });

  it("shows the result panel with score, badge, recommendation, missing inputs and the dashboard link", async () => {
    const user = userEvent.setup();
    api.submitRiskAssessment.mockResolvedValue({
      probability: 0.66,
      riskLevel: "high",
      recommendation: "Refer to cardiology.",
      assessmentId: 88,
      missingInputs: ["LBXGH", "LBXHSCRP"],
    });
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Run assessment" }));

    const panel = await screen.findByRole("region", { name: "Assessment result" });
    expect(within(panel).getByText("High risk")).toBeInTheDocument();
    expect(within(panel).getByRole("img", { name: "Risk level: high" })).toBeInTheDocument();
    expect(panel).not.toHaveTextContent("66%"); // the screening model is read as a level, not a percentage
    expect(within(panel).getByText("Refer to cardiology.")).toBeInTheDocument();
    expect(within(panel).getByText(/estimated from population medians: HbA1c \(%\), hs-CRP \(mg\/L\)/)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "View heart on dashboard" })).toHaveAttribute("href", "/dashboard?assessment=88");
    expect(api.getRiskAssessments).toHaveBeenCalledTimes(2); // past list refreshed
  });

  it("resets every value when the patient changes, asking first when something was entered", async () => {
    const user = userEvent.setup();
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Optional inputs" }));

    await user.selectOptions(screen.getByLabelText("Patient"), "11");
    const dialog = await screen.findByRole("dialog", { name: "Switch patient?" });
    expect(within(dialog).getByText("Clear the values entered for Marisol Quill?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect((screen.getByLabelText("Patient") as HTMLSelectElement).value).toBe("10");
    expect((screen.getByLabelText("BMI (kg/m²)") as HTMLInputElement).value).toBe("27.5");

    await user.selectOptions(screen.getByLabelText("Patient"), "11");
    await user.click(within(await screen.findByRole("dialog", { name: "Switch patient?" })).getByRole("button", { name: "Clear and switch" }));
    expect((screen.getByLabelText("Patient") as HTMLSelectElement).value).toBe("11");
    expect((screen.getByLabelText("BMI (kg/m²)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("History of high BP") as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Optional inputs" })).toHaveAttribute("aria-expanded", "false");
  });

  it("blocks a duplicate run until a value changes or the form is reset", async () => {
    const user = userEvent.setup();
    api.submitRiskAssessment.mockResolvedValue({ probability: 0.3, riskLevel: "low", recommendation: "ok", assessmentId: 77 });
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await fillRequired(user);
    const run = screen.getByRole("button", { name: "Run assessment" });
    await user.click(run);
    await screen.findByRole("region", { name: "Assessment result" });
    expect(run).toBeDisabled();

    await user.type(screen.getByLabelText("BMI (kg/m²)"), "1");
    expect(run).toBeEnabled();
    await user.click(run);
    await waitFor(() => expect(run).toBeDisabled());
    expect(api.submitRiskAssessment).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "New assessment" }));
    expect(screen.queryByRole("region", { name: "Assessment result" })).not.toBeInTheDocument();
    expect((screen.getByLabelText("BMI (kg/m²)") as HTMLInputElement).value).toBe("");
    expect(run).toBeEnabled();
  });

  it("keeps past rows visible while the list refreshes after a run", async () => {
    const user = userEvent.setup();
    api.submitRiskAssessment.mockResolvedValue({ probability: 0.3, riskLevel: "low", recommendation: "ok", assessmentId: 77 });
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await screen.findByText("Wren Oakes");
    api.getRiskAssessments.mockReturnValue(new Promise(() => undefined));
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Run assessment" }));
    await screen.findByRole("region", { name: "Assessment result" });
    expect(screen.getByText("Wren Oakes")).toBeInTheDocument();
  });

  it("labels the result as previous once inputs change and keeps New assessment outside the live region", async () => {
    const user = userEvent.setup();
    api.submitRiskAssessment.mockResolvedValue({ probability: 0.3, riskLevel: "low", recommendation: "ok", assessmentId: 77 });
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Run assessment" }));
    const panel = await screen.findByRole("region", { name: "Assessment result" });
    const live = panel.closest("[aria-live]");
    expect(live).not.toBeNull();
    expect(live).not.toContainElement(screen.getByRole("button", { name: "New assessment" }));

    await user.type(screen.getByLabelText("BMI (kg/m²)"), "1");
    const previous = screen.getByRole("region", { name: "Previous assessment result" });
    expect(within(previous).getByText(/Previous result/)).toBeInTheDocument();
  });

  it("keeps values typed before a patient is chosen", async () => {
    const user = userEvent.setup();
    renderPage("/assessments");
    await screen.findByLabelText("Patient");
    await user.type(screen.getByLabelText("BMI (kg/m²)"), "27.5");
    await user.selectOptions(screen.getByLabelText("Patient"), "10");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect((screen.getByLabelText("BMI (kg/m²)") as HTMLInputElement).value).toBe("27.5");
  });

  it("shows an error when a refresh fails while rows exist", async () => {
    const user = userEvent.setup();
    api.submitRiskAssessment.mockResolvedValue({ probability: 0.3, riskLevel: "low", recommendation: "ok", assessmentId: 77 });
    renderPage("/assessments?patient=10");
    await screen.findByText("Wren Oakes");
    await screen.findByLabelText("Patient");
    api.getRiskAssessments.mockRejectedValue(new Error("boom"));
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Run assessment" }));
    expect(await screen.findByText(/Couldn't refresh the list/)).toBeInTheDocument();
    expect(screen.getByText("Wren Oakes")).toBeInTheDocument();
  });

  it("moves focus to the first invalid field, opening the disclosure when needed", async () => {
    const user = userEvent.setup();
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Optional inputs" }));
    await user.type(screen.getByLabelText("Sodium (mmol/L)"), "500");
    await user.click(screen.getByRole("button", { name: "Optional inputs" }));
    await user.click(screen.getByRole("button", { name: "Run assessment" }));
    expect(screen.getByLabelText("Sodium (mmol/L)")).toHaveFocus();
  });

  it("shows a neutral unknown risk (not low) for an unexpected risk level in the result", async () => {
    const user = userEvent.setup();
    api.submitRiskAssessment.mockResolvedValue({ probability: 0.3, riskLevel: "weird", recommendation: "ok", assessmentId: 5 });
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Run assessment" }));
    expect(await screen.findByText("Unknown risk")).toBeInTheDocument();
  });

  it("shows the 10-year death model as a percentage with plain wording", async () => {
    const user = userEvent.setup();
    api.submitRiskAssessment.mockResolvedValue({
      probability: 0.031, riskLevel: "medium", scoreType: "death_10y", recommendation: "ok", assessmentId: 6,
    });
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Run assessment" }));
    const panel = await screen.findByRole("region", { name: "Assessment result" });
    expect(within(panel).getByText("3%")).toBeInTheDocument();
    expect(within(panel).getByText("About 3 in 100 people like this patient")).toBeInTheDocument();
    expect(within(panel).getByText(/10-year risk of dying from heart disease or stroke/)).toBeInTheDocument();
  });

  it("shows a readable API validation message", async () => {
    const user = userEvent.setup();
    api.submitRiskAssessment.mockImplementationOnce(() => Promise.reject(new Error("systolicBp: Input should be less than or equal to 260")));
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Run assessment" }));
    expect(await screen.findByText("systolicBp: Input should be less than or equal to 260")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Assessment result" })).not.toBeInTheDocument();
  });

  it("opens the disclosure when a hidden optional input is invalid", async () => {
    const user = userEvent.setup();
    renderPage("/assessments?patient=10");
    await screen.findByLabelText("Patient");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Optional inputs" }));
    await user.type(screen.getByLabelText("Sodium (mmol/L)"), "500");
    await user.click(screen.getByRole("button", { name: "Optional inputs" }));
    await user.click(screen.getByRole("button", { name: "Run assessment" }));
    expect(screen.getByRole("button", { name: "Optional inputs" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/must be between 110 and 170/)).toBeInTheDocument();
  });
});
