import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Patient } from "../api/types";

const api = vi.hoisted(() => ({ getPatients: vi.fn(), createPatient: vi.fn() }));
vi.mock("../api/client", () => api);

import { SearchProvider, useSearch } from "../context/SearchContext";
import { PatientsList } from "./PatientsList";

function patient(over: Partial<Patient> = {}): Patient {
  return {
    patientId: 1,
    externalPatientCode: "P-0001",
    sex: "female",
    firstName: "Marisol",
    lastName: "Quill",
    dateOfBirth: "1960-01-15",
    phone: "",
    email: "",
    createdAt: "2026-09-01T00:00:00Z",
    lastAssessment: {
      assessmentId: 41,
      createdAt: "2026-10-01T10:00:00Z",
      probabilityCvd: 0.42,
      riskLevel: "medium",
      effectiveRiskLevel: "high",
      reviewStatus: "pending",
    },
    ...over,
  };
}

const unassessed = patient({
  patientId: 2,
  externalPatientCode: "P-0002",
  sex: "male",
  firstName: "Alder",
  lastName: "Fennimore",
  dateOfBirth: "1985-06-30",
  lastAssessment: null,
});

function Where() {
  const l = useLocation();
  return <output data-testid="loc">{l.pathname + l.search}</output>;
}

function SearchBox() {
  const { setQuery } = useSearch();
  return <input aria-label="top search" onChange={(e) => setQuery(e.target.value)} />;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/patients"]}>
      <SearchProvider>
        <SearchBox />
        <Routes>
          <Route path="/patients" element={<PatientsList />} />
          <Route path="*" element={<Where />} />
        </Routes>
        <Where />
      </SearchProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getPatients.mockReset();
  api.createPatient.mockReset();
});

describe("PatientsList", () => {
  it("renders the table with last assessment, effective risk and Not assessed rows", async () => {
    api.getPatients.mockResolvedValue([patient(), unassessed]);
    renderPage();

    expect(await screen.findByText("2 patients in your clinic")).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    const first = within(rows[1]);
    expect(first.getByText("Marisol Quill")).toBeInTheDocument();
    expect(first.getByText("P-0001")).toBeInTheDocument();
    expect(first.getByText(/^Female, \d+$/)).toBeInTheDocument();
    expect(first.getByText("1 Oct 2026")).toBeInTheDocument();
    expect(first.getByText("42.0%")).toBeInTheDocument();
    expect(first.getByText("high")).toHaveAttribute("data-variant", "high"); // effective, not the model's "medium"

    const second = within(rows[2]);
    expect(second.getByText("Not assessed")).toBeInTheDocument();
    expect(second.getByText(/^Male, \d+$/)).toBeInTheDocument();
  });

  it("routes Open to the dashboard assessment and Assess to Assessments with the patient", async () => {
    api.getPatients.mockResolvedValue([patient(), unassessed]);
    renderPage();
    await screen.findByText("Marisol Quill");

    expect(screen.getByRole("link", { name: "Open Marisol Quill on the dashboard" })).toHaveAttribute(
      "href",
      "/dashboard?assessment=41",
    );
    await userEvent.click(screen.getByRole("link", { name: "Assess Alder Fennimore" }));
    expect(screen.getAllByTestId("loc").at(-1)).toHaveTextContent("/assessments?patient=2");
  });

  it("links the patient name to the details page", async () => {
    api.getPatients.mockResolvedValue([patient()]);
    renderPage();
    expect(await screen.findByRole("link", { name: "Marisol Quill" })).toHaveAttribute("href", "/patients/1");
  });

  it("filters by the top search (name or code)", async () => {
    api.getPatients.mockResolvedValue([patient(), unassessed]);
    renderPage();
    await screen.findByText("Marisol Quill");

    await userEvent.type(screen.getByLabelText("top search"), "p-0002");
    expect(screen.queryByText("Marisol Quill")).not.toBeInTheDocument();
    expect(screen.getByText("Alder Fennimore")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("top search"));
    await userEvent.type(screen.getByLabelText("top search"), "zzz");
    expect(screen.getByText("No patients match that search.")).toBeInTheDocument();
  });

  it("shows the first-patient empty state", async () => {
    api.getPatients.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Add your first patient")).toBeInTheDocument();
  });

  it("adds a patient from the modal and shows it first as Not assessed", async () => {
    api.getPatients.mockResolvedValue([patient()]);
    api.createPatient.mockResolvedValue(
      patient({ patientId: 9, externalPatientCode: "P-0009", firstName: "Ned", lastName: "Stark", sex: "male", dateOfBirth: "1980-05-05", lastAssessment: null }),
    );
    renderPage();
    await screen.findByText("Marisol Quill");

    await userEvent.click(screen.getByRole("button", { name: "Add patient" }));
    const dialog = screen.getByRole("dialog", { name: "Add patient" });
    await userEvent.type(within(dialog).getByLabelText("Full name"), "Ned Stark");
    await userEvent.selectOptions(within(dialog).getByLabelText("Sex"), "male");
    await userEvent.type(within(dialog).getByLabelText("Date of birth"), "1980-05-05");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add patient" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.createPatient).toHaveBeenCalledWith({
      firstName: "Ned",
      lastName: "Stark",
      sex: "male",
      dateOfBirth: "1980-05-05",
      externalPatientCode: undefined,
    });
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Ned Stark")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Not assessed")).toBeInTheDocument();
    expect(screen.getByText("2 patients in your clinic")).toBeInTheDocument();
  });
});
