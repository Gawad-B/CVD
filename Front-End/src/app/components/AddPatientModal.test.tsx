import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ createPatient: vi.fn() }));
vi.mock("../api/client", () => api);

import { AddPatientModal, splitFullName } from "./AddPatientModal";

function setup() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(<AddPatientModal open onClose={onClose} onCreated={onCreated} />);
  const dialog = screen.getByRole("dialog", { name: "Add patient" });
  return { dialog, onClose, onCreated, q: within(dialog) };
}

beforeEach(() => api.createPatient.mockReset());

describe("splitFullName", () => {
  it("splits on the last space and needs two words", () => {
    expect(splitFullName("  Mary   Ann  Smith ")).toEqual({ firstName: "Mary Ann", lastName: "Smith" });
    expect(splitFullName("Cher")).toBeNull();
    expect(splitFullName("   ")).toBeNull();
  });
});

describe("AddPatientModal", () => {
  it("requires a two-word name, a sex and a valid DOB", async () => {
    const { q, onCreated } = setup();
    await userEvent.type(q.getByLabelText("Full name"), "Cher");
    await userEvent.click(q.getByRole("button", { name: "Add patient" }));

    expect(q.getByText("Enter a first and last name.")).toBeInTheDocument();
    expect(q.getByText("Select a sex.")).toBeInTheDocument();
    expect(q.getByText("Enter the date of birth.")).toBeInTheDocument();
    expect(api.createPatient).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("shows the age live and rejects under 18 and over 120", async () => {
    const { q } = setup();
    const dob = q.getByLabelText("Date of birth");

    await userEvent.type(dob, "1980-05-05");
    expect(q.getByText(/^Age \d+$/)).toBeInTheDocument();

    await userEvent.clear(dob);
    const year = new Date().getFullYear() - 10;
    await userEvent.type(dob, `${year}-01-01`);
    expect(q.getByText(/18–120 years old; the model is adult-only/)).toBeInTheDocument();

    await userEvent.clear(dob);
    await userEvent.type(dob, "1800-01-01");
    expect(q.getByText(/18–120 years old/)).toBeInTheDocument();
    expect(dob).toHaveAttribute("max");
  });

  it("submits first/last, sex, DOB and the optional code", async () => {
    api.createPatient.mockResolvedValue({ patientId: 5 });
    const { q, onCreated, onClose } = setup();
    await userEvent.type(q.getByLabelText("Full name"), "Mary Ann Smith");
    await userEvent.selectOptions(q.getByLabelText("Sex"), "female");
    await userEvent.type(q.getByLabelText("Date of birth"), "1975-03-09");
    await userEvent.type(q.getByLabelText("Patient code (optional)"), " P-77 ");
    await userEvent.click(q.getByRole("button", { name: "Add patient" }));

    expect(api.createPatient).toHaveBeenCalledWith({
      firstName: "Mary Ann",
      lastName: "Smith",
      sex: "female",
      dateOfBirth: "1975-03-09",
      externalPatientCode: "P-77",
    });
    expect(onCreated).toHaveBeenCalledWith({ patientId: 5 });
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the modal open and shows the API error", async () => {
    api.createPatient.mockImplementationOnce(() => Promise.reject(new Error("Patient code already exists")));
    const { q, onClose } = setup();
    await userEvent.type(q.getByLabelText("Full name"), "Mary Smith");
    await userEvent.selectOptions(q.getByLabelText("Sex"), "female");
    await userEvent.type(q.getByLabelText("Date of birth"), "1975-03-09");
    await userEvent.click(q.getByRole("button", { name: "Add patient" }));

    expect(await q.findByText("Patient code already exists")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancel closes without saving", async () => {
    const { q, onClose } = setup();
    await userEvent.click(q.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(api.createPatient).not.toHaveBeenCalled();
  });
});
