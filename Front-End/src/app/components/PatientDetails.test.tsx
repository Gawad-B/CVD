import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Patient, RiskAssessment } from "../api/types";
import { ApiError } from "../api/errors";

const api = vi.hoisted(() => ({
  getPatient: vi.fn(),
  getPatientEncounters: vi.fn(),
  getPatientRiskAssessments: vi.fn(),
  deactivatePatient: vi.fn(),
  updatePatient: vi.fn(),
  createEncounter: vi.fn(),
}));
vi.mock("../api/client", () => api);
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { userId: 1, role: "doctor" } }) }));

import { PatientDetails } from "./PatientDetails";

const patient: Patient = {
  patientId: 10,
  externalPatientCode: "P-0010",
  sex: "female",
  firstName: "Marisol",
  lastName: "Quill",
  dateOfBirth: "1960-01-15",
  phone: "555-0100",
  email: "m@quill.test",
  createdAt: "2026-01-01T00:00:00Z",
  lastAssessment: null,
};

const assessment = {
  assessmentId: 41,
  patientId: 10,
  patientName: "Marisol Quill",
  probabilityCvd: 0.42,
  riskLevel: "medium",
  effectiveRiskLevel: "high",
  reviewStatus: "pending",
  effectiveRecommendation: "Refer to cardiology.",
  overrideRiskLevel: "high",
  createdAt: "2026-10-01T10:00:00Z",
} as RiskAssessment;

function Where() {
  const l = useLocation();
  return <output data-testid="loc">{l.pathname + l.search}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/patients/10"]}>
      <Routes>
        <Route path="/patients/:patientId" element={<PatientDetails />} />
        <Route path="/patients" element={<div>patients list</div>} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PatientDetails", () => {
  beforeEach(() => {
    api.getPatient.mockReset().mockResolvedValue(patient);
    api.getPatientEncounters.mockReset().mockResolvedValue([]);
    api.getPatientRiskAssessments.mockReset().mockResolvedValue([assessment]);
    api.deactivatePatient.mockReset();
    api.updatePatient.mockReset();
  });

  it("fetches the single patient by id (not the whole list)", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Marisol Quill" });
    expect(api.getPatient).toHaveBeenCalledWith(10);
  });

  it("shows Patient not found on a 404 and a retryable error otherwise", async () => {
    api.getPatient.mockRejectedValueOnce(new ApiError({ status: 404, message: "Patient not found" }));
    const first = renderPage();
    expect(await screen.findByRole("heading", { name: "Patient not found" })).toBeInTheDocument();
    first.unmount();
    api.getPatient.mockRejectedValueOnce(new ApiError({ status: 500, message: "boom" }));
    renderPage();
    expect(await screen.findByText("Couldn't load this patient.")).toBeInTheDocument();
  });

  it("shows age instead of the raw date of birth, effective risk and links", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Marisol Quill" })).toBeInTheDocument();
    expect(screen.queryByText(/1960/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/years/).length).toBeGreaterThan(0);
    expect(await screen.findByText("high risk")).toHaveAttribute("data-variant", "high");
    expect(screen.getByText("Overridden")).toBeInTheDocument();
    expect(screen.getByText("model: medium")).toBeInTheDocument();
    expect(screen.getByText("Set by clinician")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New assessment" })).toHaveAttribute("href", "/assessments?patient=10");
    expect(screen.getByRole("link", { name: "View on dashboard" })).toHaveAttribute("href", "/dashboard?assessment=41");
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("href", "/assessments/41");
  });

  it("asks in an app modal before deactivating, and does nothing on cancel", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole("button", { name: "Deactivate" }));
    let dialog = screen.getByRole("dialog", { name: "Deactivate patient?" });
    await u.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.deactivatePatient).not.toHaveBeenCalled();

    api.deactivatePatient.mockResolvedValue(undefined);
    await u.click(screen.getByRole("button", { name: "Deactivate" }));
    dialog = screen.getByRole("dialog", { name: "Deactivate patient?" });
    await u.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(api.deactivatePatient).toHaveBeenCalledWith(10));
    expect(await screen.findByText("patients list")).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("edits the patient in a modal", async () => {
    api.updatePatient.mockResolvedValue({ ...patient, firstName: "Mari" });
    const u = userEvent.setup();
    renderPage();
    await u.click(await screen.findByRole("button", { name: "Edit patient" }));
    const dialog = screen.getByRole("dialog", { name: "Edit patient" });
    const first = within(dialog).getByLabelText("First name");
    await u.clear(first);
    await u.type(first, "Mari");
    await u.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(api.updatePatient).toHaveBeenCalledWith(10, expect.objectContaining({ firstName: "Mari", dateOfBirth: "1960-01-15" }));
    expect(await screen.findByRole("heading", { name: "Mari Quill" })).toBeInTheDocument();
  });
});
