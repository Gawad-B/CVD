import { useState, type FormEvent } from "react";
import { createPatient } from "../api/client";
import type { Patient } from "../api/types";
import { Button, Field, Input, Modal, Select } from "../ui";
import { ageFromDob, dobProblem, todayIso } from "./dateOfBirth";

interface AddPatientModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (patient: Patient) => void;
}

interface Errors {
  name?: string;
  sex?: string;
  dob?: string;
}

/** Split "Mary Ann Smith" on the last space: first "Mary Ann", last "Smith". Needs at least two words. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } | null {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  return { firstName: words.slice(0, -1).join(" "), lastName: words[words.length - 1] };
}

function Form({ onClose, onCreated }: Omit<AddPatientModalProps, "open">) {
  const [fullName, setFullName] = useState("");
  const [sex, setSex] = useState("");
  const [dob, setDob] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  const age = ageFromDob(dob);
  // Show the live age problem as soon as a full date is typed; other errors wait for submit.
  const dobError = (dob ? dobProblem(dob) : errors.dob) ?? undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const name = splitFullName(fullName);
    const next: Errors = {};
    if (!name) next.name = "Enter a first and last name.";
    if (!sex) next.sex = "Select a sex.";
    const dobIssue = dobProblem(dob);
    if (dobIssue) next.dob = dobIssue;
    setErrors(next);
    setSubmitError("");
    if (!name || !sex || dobIssue) return;

    setSaving(true);
    try {
      const created = await createPatient({
        ...name,
        sex,
        dateOfBirth: dob,
        externalPatientCode: code.trim() || undefined,
      });
      onCreated(created);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error && error.message ? error.message : "Could not add the patient. Try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={saving} className="mt-5 flex flex-col gap-4">
      <Field label="Full name" error={errors.name}>
        {(a) => (
          <Input
            {...a}
            value={fullName}
            autoComplete="off"
            placeholder="First and last name"
            onChange={(e) => {
              setFullName(e.target.value);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
          />
        )}
      </Field>
      <Field label="Sex" error={errors.sex}>
        {(a) => (
          <Select {...a} value={sex} onChange={(e) => {
              setSex(e.target.value);
              setErrors((prev) => ({ ...prev, sex: undefined }));
            }}>
            <option value="">Select…</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Select>
        )}
      </Field>
      <Field
        label="Date of birth"
        error={dobError}
        hint={age !== null && !dobError ? `Age ${age}` : "Adults only (18–120 years)"}
      >
        {(a) => <Input {...a} type="date" max={todayIso()} value={dob} onChange={(e) => setDob(e.target.value)} />}
      </Field>
      <Field label="Patient code (optional)" hint="Optional identifier shown in lists and search">
        {(a) => <Input {...a} value={code} autoComplete="off" onChange={(e) => setCode(e.target.value)} />}
      </Field>
      {submitError && (
        <p role="alert" className="rounded-[12px] bg-[#fee2e2] px-3.5 py-2.5 text-[13px] text-[#b91c1c]">
          {submitError}
        </p>
      )}
      <div className="mt-1 flex justify-end gap-2.5">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Adding…" : "Add patient"}
        </Button>
      </div>
    </form>
  );
}

export function AddPatientModal({ open, onClose, onCreated }: AddPatientModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Add patient">
      {/* Mounted only while open, so every opening starts from an empty form. */}
      <Form onClose={onClose} onCreated={onCreated} />
    </Modal>
  );
}
