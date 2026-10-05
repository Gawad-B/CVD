import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ChevronDown } from "lucide-react";
import { submitRiskAssessment } from "../../api/client";
import type { Patient, RiskAssessmentResponse } from "../../api/types";
import { normalizeRisk } from "../../heart";
import { RISK_TONE } from "../../heart/riskTone";
import { Badge, Button, Card, CardTitle, ConfirmModal, Field, Input, Select, buttonClasses, cn, riskVariant } from "../../ui";
import {
  HEART_RATE_MAX,
  HEART_RATE_MIN,
  MORE_FIELDS,
  REQUIRED_FIELDS,
  buildAssessmentPayload,
  initialValues,
  validateAssessment,
  type AssessmentField,
  type FormErrors,
  type FormValues,
} from "../assessmentFields";
import { FEATURE_LABELS, INPUT_RANGES, SCORE_DISCLAIMER } from "../clinicalConstants";
import { ageFromDob } from "../dateOfBirth";

interface Props {
  patients: Patient[];
  /** Patient to preselect (from `?patient=<id>`). */
  initialPatientId: number | null;
  /** Called after the API saved a new assessment so the past list can refresh. */
  onCreated: () => void;
}

const GRID = "grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2";
const optionName = (p: Patient) => `${`${p.firstName} ${p.lastName}`.trim()}${p.externalPatientCode ? ` · ${p.externalPatientCode}` : ""}`;

function ResultPanel({ result, stale }: { result: RiskAssessmentResponse; stale: boolean }) {
  const level = normalizeRisk(result.riskLevel);
  const missing = (result.missingInputs ?? []).map((column) => FEATURE_LABELS[column] ?? column);
  const target = result.assessmentId ? `/dashboard?assessment=${result.assessmentId}` : "/dashboard";
  return (
    <section
      aria-label={stale ? "Previous assessment result" : "Assessment result"}
      className={cn("mt-5 rounded-[16px] border-l-4 bg-[#f3f6fc] p-4", stale && "opacity-70")}
      style={{ borderLeftColor: RISK_TONE[level].color }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-[#5b6b85]">
            {stale ? "Previous result (inputs changed since this run)" : "Model score"}
          </p>
          <p className="text-[30px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-[#0b1530]">
            {Math.round(result.probability * 100)}%
          </p>
        </div>
        <Badge variant={riskVariant(level)} className="capitalize">
          {level} risk
        </Badge>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-[#33405a]">{result.recommendation}</p>
      {missing.length > 0 && (
        <p role="note" className="mt-3 rounded-[12px] bg-[#fef3c7] px-3.5 py-2.5 text-[13px] text-[#b45309]">
          Some inputs were not recorded and were estimated from population medians: {missing.join(", ")}.
        </p>
      )}
      <p className="mt-3 text-[12px] text-[#5b6b85]">Decision support only. {SCORE_DISCLAIMER}</p>
      <Link to={target} className={buttonClasses("primary", "md", "mt-4")}>
        View heart on dashboard
      </Link>
    </section>
  );
}

function renderField(
  field: AssessmentField,
  values: FormValues,
  errors: FormErrors,
  set: (name: string, value: string) => void,
  emptyLabel = "Not recorded",
) {
  return (
    <Field key={field.name} label={field.label} error={errors[field.name]}>
      {(a) =>
        field.kind === "number" ? (
          <Input
            {...a}
            type="number"
            inputMode="decimal"
            min={INPUT_RANGES[field.name]?.min}
            max={INPUT_RANGES[field.name]?.max}
            step={INPUT_RANGES[field.name]?.step ?? "any"}
            value={values[field.name]}
            onChange={(e) => set(field.name, e.target.value)}
          />
        ) : (
          <Select {...a} value={values[field.name]} onChange={(e) => set(field.name, e.target.value)}>
            <option value="">{emptyLabel}</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        )
      }
    </Field>
  );
}

export function NewAssessmentForm({ patients, initialPatientId, onCreated }: Props) {
  const moreId = useId();
  const [patientId, setPatientId] = useState<string>(() =>
    initialPatientId !== null && patients.some((p) => p.patientId === initialPatientId) ? String(initialPatientId) : "",
  );
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<RiskAssessmentResponse | null>(null);
  // True right after a successful run until something changes: blocks accidental duplicate runs.
  const [justRan, setJustRan] = useState(false);
  // Inputs were edited after the last run, so the shown result no longer matches the form.
  const [stale, setStale] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const patient = patients.find((p) => String(p.patientId) === patientId) ?? null;
  const age = patient ? ageFromDob(patient.dateOfBirth) : null;

  useEffect(() => {
    if (focusNonce > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusNonce]);

  const isDirty = () => {
    const blank = initialValues();
    return Object.keys(blank).some((k) => values[k] !== blank[k]);
  };

  function resetForm() {
    setValues(initialValues());
    setErrors({});
    setSubmitError("");
    setResult(null);
    setJustRan(false);
    setStale(false);
    setMoreOpen(false);
  }

  const [pendingPatient, setPendingPatient] = useState<string | null>(null);

  function changePatient(next: string) {
    if (isDirty() && patient) {
      setPendingPatient(next);
      return;
    }
    setPatientId(next);
    if (patient) {
      resetForm();
    } else {
      // Nothing was selected before: keep what was typed and only drop the patient error.
      setErrors((prev) => (prev.patient ? { ...prev, patient: "" } : prev));
    }
  }

  function confirmPatientChange() {
    if (pendingPatient === null) return;
    setPatientId(pendingPatient);
    resetForm();
    setPendingPatient(null);
  }

  const set = (name: string, value: string) => {
    setJustRan(false);
    setStale(true);
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: "" } : prev));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (running) return;
    const found = validateAssessment(values, age);
    if (!patient) {
      delete found.age;
      found.patient = "Select a patient.";
    }
    setErrors(found);
    setSubmitError("");
    setResult(null);
    setStale(false);
    if (Object.keys(found).length > 0 || !patient || age === null) {
      if (MORE_FIELDS.some((f) => found[f.name])) setMoreOpen(true);
      setFocusNonce((n) => n + 1);
      return;
    }
    setRunning(true);
    try {
      const response = await submitRiskAssessment({ patientId: patient.patientId, payload: buildAssessmentPayload(values, age) });
      setResult(response);
      setJustRan(true);
      onCreated();
    } catch (error) {
      setSubmitError(error instanceof Error && error.message ? error.message : "Could not run the assessment. Try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardTitle>New assessment</CardTitle>
      <form ref={formRef} onSubmit={submit} noValidate aria-busy={running} className="mt-4 flex flex-col gap-3.5">
        <Field label="Patient" error={errors.patient}>
          {(a) => (
            <Select
              {...a}
              value={patientId}
              onChange={(e) => changePatient(e.target.value)}
            >
              <option value="">Select a patient…</option>
              {patients.map((p) => (
                <option key={p.patientId} value={p.patientId}>
                  {optionName(p)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className={GRID}>
          <Field label="Age" hint={patient ? "From date of birth" : undefined} error={errors.age}>
            {(a) => <Input {...a} readOnly value={age ?? ""} placeholder="—" className="!bg-[#f3f6fc]" />}
          </Field>
          {REQUIRED_FIELDS.map((f) => renderField(f, values, errors, set, "Select…"))}
          <Field label="Heart rate (bpm)" hint="Optional · not used by the model" error={errors.heartRate} className="min-[480px]:col-span-2">
            {(a) => (
              <Input
                {...a}
                type="number"
                inputMode="numeric"
                min={HEART_RATE_MIN}
                max={HEART_RATE_MAX}
                step={1}
                value={values.heartRate}
                onChange={(e) => set("heartRate", e.target.value)}
              />
            )}
          </Field>
        </div>

        <div>
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls={moreId}
            onClick={() => setMoreOpen((open) => !open)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-[#1446d1] hover:bg-[#e8eefb]"
          >
            Optional inputs
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-150 motion-reduce:transition-none", moreOpen && "rotate-180")} aria-hidden />
          </button>
          <div id={moreId} hidden={!moreOpen} className="mt-2">
            {moreOpen && (
              <div className="flex flex-col gap-3.5 rounded-[14px] bg-[#f3f6fc] p-3.5">
                <p className="text-[12.5px] text-[#5b6b85]">
                  All optional — these inputs have little influence on the model. Anything left as “Not recorded” is estimated from the training data (median or most common answer).
                </p>
                <div className={GRID}>{MORE_FIELDS.map((f) => renderField(f, values, errors, set))}</div>
                <Field label="Clinical notes">
                  {(a) => (
                    <textarea
                      {...a}
                      rows={3}
                      value={values.notes}
                      onChange={(e) => set("notes", e.target.value)}
                      className="w-full resize-none rounded-[12px] border border-[#d6deec] bg-white px-3.5 py-2.5 text-[15px] text-[#0b1530] focus:border-[#1f5eff]"
                    />
                  )}
                </Field>
              </div>
            )}
          </div>
        </div>

        {Object.values(errors).some(Boolean) && (
          <p role="alert" className="rounded-[12px] bg-[#fee2e2] px-3.5 py-2.5 text-[13px] text-[#b91c1c]">
            Fix the highlighted fields and run the assessment again.
          </p>
        )}
        {submitError && (
          <p role="alert" className="rounded-[12px] bg-[#fee2e2] px-3.5 py-2.5 text-[13px] text-[#b91c1c]">
            {submitError}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={running || justRan}>
          {running ? "Running…" : "Run assessment"}
        </Button>
      </form>
      <div aria-live="polite">{result && <ResultPanel result={result} stale={stale} />}</div>
      {result && (
        <Button variant="secondary" className="mt-3 w-full" onClick={resetForm}>
          New assessment
        </Button>
      )}
      <ConfirmModal
        open={pendingPatient !== null}
        title="Switch patient?"
        message={`Clear the values entered for ${patient ? `${patient.firstName} ${patient.lastName}`.trim() : "this patient"}?`}
        confirmLabel="Clear and switch"
        onConfirm={confirmPatientChange}
        onClose={() => setPendingPatient(null)}
      />
    </Card>
  );
}
