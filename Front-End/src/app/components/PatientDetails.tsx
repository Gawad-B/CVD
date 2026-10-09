import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Mail, Phone, Plus } from "lucide-react";
import { createEncounter, deactivatePatient, getPatient, getPatientEncounters, getPatientRiskAssessments, updatePatient } from "../api/client";
import { ApiError } from "../api/errors";
import type { Encounter, Patient } from "../api/types";
import { PATIENTS_ROLES, hasRoleAccess } from "../auth/permissions";
import { useAuth } from "../context/AuthContext";
import { Avatar, Badge, Button, Card, CardTitle, ConfirmModal, Field, Input, Modal, Select, buttonClasses, riskVariant } from "../ui";
import { ageFromDob, dobProblem, todayIso } from "./dateOfBirth";
import { ErrorCard, Skeleton } from "./dashboard/Panels";
import { formatDate, isOverridden, sexLabel } from "./dashboard/logic";
import { useLoader } from "./dashboard/useLoader";
import { levelReason } from "./formatScore";

const textarea =
  "w-full rounded-[12px] border border-[#d6deec] bg-white px-3.5 py-3 text-[15px] leading-relaxed text-[#0b1530] placeholder:text-[#8fa1c4] focus:border-[#1f5eff]";

const fullName = (p: Patient) => `${p.firstName} ${p.lastName}`.trim();
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

function dateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(iso)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function EditPatientModal({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: (p: Patient) => void }) {
  const [form, setForm] = useState({
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth,
    sex: patient.sex ?? "",
    email: patient.email,
    phone: patient.phone,
    externalPatientCode: patient.externalPatientCode,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const dobError = dobProblem(form.dateOfBirth) ?? undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Enter a first and last name.");
      return;
    }
    if (dobError) return;
    setError(null);
    setSaving(true);
    try {
      onSaved(
        await updatePatient(patient.patientId, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          dateOfBirth: form.dateOfBirth,
          sex: form.sex || null,
          email: form.email.trim(),
          phone: form.phone.trim(),
          externalPatientCode: form.externalPatientCode.trim(),
        })
      );
    } catch (e) {
      setError(errorText(e, "Could not update the patient."));
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit patient" className="max-w-[520px]">
      <form onSubmit={submit} noValidate className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name">{(c) => <Input {...c} value={form.firstName} onChange={set("firstName")} />}</Field>
        <Field label="Last name">{(c) => <Input {...c} value={form.lastName} onChange={set("lastName")} />}</Field>
        <Field label="Date of birth" error={dobError}>
          {(c) => <Input {...c} type="date" max={todayIso()} value={form.dateOfBirth} onChange={set("dateOfBirth")} />}
        </Field>
        <Field label="Sex">
          {(c) => (
            <Select {...c} value={form.sex} onChange={set("sex")}>
              <option value="">Unspecified</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </Select>
          )}
        </Field>
        <Field label="Email">{(c) => <Input {...c} type="email" value={form.email} onChange={set("email")} />}</Field>
        <Field label="Phone">{(c) => <Input {...c} value={form.phone} onChange={set("phone")} />}</Field>
        <Field label="Patient code" className="sm:col-span-2">
          {(c) => <Input {...c} value={form.externalPatientCode} onChange={set("externalPatientCode")} />}
        </Field>
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-[#b91c1c] sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EncounterModal({ patientId, onClose, onSaved }: { patientId: number; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes] = useState("");
  const [featureName, setFeatureName] = useState("");
  const [featureValue, setFeatureValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const name = featureName.trim();
    const value = featureValue.trim();
    try {
      await createEncounter({
        patientId,
        notes: notes.trim(),
        features: name && value ? [{ name, value, valueType: "string" }] : [],
      });
      onSaved();
    } catch (e) {
      setError(errorText(e, "Could not add the encounter."));
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add encounter" className="max-w-[520px]">
      <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-4">
        <Field label="Encounter notes">
          {(c) => <textarea {...c} rows={3} className={textarea} value={notes} placeholder="Visit notes, observations and summary" onChange={(e) => setNotes(e.target.value)} />}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Extra measurement (optional)">
            {(c) => <Input {...c} value={featureName} placeholder="e.g. pulse" onChange={(e) => setFeatureName(e.target.value)} />}
          </Field>
          <Field label="Value (optional)">
            {(c) => <Input {...c} value={featureValue} placeholder="e.g. 78" onChange={(e) => setFeatureValue(e.target.value)} />}
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-[#b91c1c]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save encounter"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EncounterItem({ encounter }: { encounter: Encounter }) {
  return (
    <li className="rounded-[16px] bg-[#f3f6fc] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold text-[#0b1530]">{dateTime(encounter.encounterDate)}</span>
        <span className="text-[12px] text-[#5b6b85]">{`${encounter.features.length} ${encounter.features.length === 1 ? "measurement" : "measurements"}`}</span>
      </div>
      {encounter.notes && <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#33405a]">{encounter.notes}</p>}
      {encounter.features.length > 0 && (
        <dl className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
          {encounter.features.map((f) => (
            <div key={f.featureId} className="rounded-[12px] bg-white px-3 py-2">
              <dt className="truncate text-[11.5px] text-[#5b6b85]">{f.featureCode}</dt>
              <dd className="text-[14px] font-semibold text-[#0b1530]">{f.featureValue}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

function isNotFound(error: Error | null): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function PatientDetails() {
  const { patientId } = useParams();
  const id = Number(patientId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = hasRoleAccess(user?.role, PATIENTS_ROLES);

  const patientsLoad = useLoader(() => getPatient(id), id, Boolean(id));
  const encountersLoad = useLoader(() => getPatientEncounters(id), id, Boolean(id));
  const assessmentsLoad = useLoader(() => getPatientRiskAssessments(id), id, Boolean(id));

  const [edited, setEdited] = useState<Patient | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [encounterOpen, setEncounterOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const found = patientsLoad.data;
  const patient = edited && edited.patientId === id ? edited : found;

  const back = (
    <Link to="/patients" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#33405a] hover:text-[#1446d1]">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to patients
    </Link>
  );

  if (!patient) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        {!id || isNotFound(patientsLoad.error) ? (
          <Card className="mx-auto flex max-w-[560px] flex-col items-center gap-2 py-12 text-center">
            <h1 className="text-[22px] font-bold text-[#0b1530]">Patient not found</h1>
            <p className="text-[14px] text-[#5b6b85]">This patient may have been removed.</p>
          </Card>
        ) : patientsLoad.error ? (
          <ErrorCard title="Couldn't load this patient." onRetry={patientsLoad.reload} />
        ) : (
          <Skeleton className="h-[220px] !rounded-[22px]" />
        )}
      </div>
    );
  }

  const name = fullName(patient);
  const age = ageFromDob(patient.dateOfBirth);
  const sex = sexLabel(patient.sex);

  async function remove() {
    setActionError(null);
    try {
      await deactivatePatient(patient!.patientId);
      navigate("/patients");
    } catch (e) {
      setRemoveOpen(false);
      setActionError(errorText(e, "Could not remove the patient."));
    }
  }

  const assessments = assessmentsLoad.data;
  const encounters = encountersLoad.data;

  return (
    <div className="flex flex-col gap-5">
      {back}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={name} size={60} shape="square" className="!bg-[#e6edff] !text-[18px] !text-[#1446d1]" />
            <div className="min-w-0">
              <h1 className="text-[clamp(24px,2.4vw,30px)] font-bold leading-tight tracking-[-0.03em] text-[#0b1530]">{name}</h1>
              <p className="mt-1 text-[14px] text-[#5b6b85]">
                {[patient.externalPatientCode, sex, age === null ? null : `${age} years`].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setEditOpen(true)}>
                  Edit patient
                </Button>
                <Button variant="secondary" onClick={() => setRemoveOpen(true)} className="!border-[#fecaca] !text-[#b91c1c] hover:!border-[#dc2626]">
                  Deactivate
                </Button>
              </>
            )}
            <Link to={`/assessments?patient=${patient.patientId}`} className={buttonClasses("primary")}>
              New assessment
            </Link>
          </div>
        </div>
        {actionError && (
          <p role="alert" className="mt-4 rounded-[12px] bg-[#fee2e2] px-4 py-3 text-[13px] font-semibold text-[#b91c1c]">
            {actionError}
          </p>
        )}
        <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <div className="rounded-[14px] bg-[#f3f6fc] p-3.5">
            <dt className="text-[12px] font-semibold text-[#5b6b85]">Age</dt>
            <dd className="mt-1 text-[15px] font-semibold text-[#0b1530]">{age === null ? "—" : `${age} years`}</dd>
          </div>
          <div className="rounded-[14px] bg-[#f3f6fc] p-3.5">
            <dt className="text-[12px] font-semibold text-[#5b6b85]">Sex</dt>
            <dd className="mt-1 text-[15px] font-semibold text-[#0b1530]">{sex ?? "—"}</dd>
          </div>
          <div className="min-w-0 rounded-[14px] bg-[#f3f6fc] p-3.5">
            <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5b6b85]"><Mail className="h-3.5 w-3.5" aria-hidden />Email</dt>
            <dd className="mt-1 truncate text-[15px] font-semibold text-[#0b1530]">{patient.email || "—"}</dd>
          </div>
          <div className="rounded-[14px] bg-[#f3f6fc] p-3.5">
            <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5b6b85]"><Phone className="h-3.5 w-3.5" aria-hidden />Phone</dt>
            <dd className="mt-1 text-[15px] font-semibold text-[#0b1530]">{patient.phone || "—"}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle>Assessment history</CardTitle>
          {assessments && <span className="text-[12.5px] text-[#5b6b85]">{`${assessments.length} ${assessments.length === 1 ? "assessment" : "assessments"}`}</span>}
        </div>
        {assessments === null ? (
          assessmentsLoad.error ? (
            <div className="mt-3"><ErrorCard title="Couldn't load assessments." onRetry={assessmentsLoad.reload} /></div>
          ) : (
            <Skeleton className="mt-3 h-[120px]" />
          )
        ) : assessments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-[14px] text-[#5b6b85]">No assessments yet.</p>
            <Link to={`/assessments?patient=${patient.patientId}`} className={buttonClasses("primary", "sm")}>
              Run the first assessment
            </Link>
          </div>
        ) : (
          <ul className="mt-3.5 flex flex-col gap-2.5">
            {assessments.map((a) => (
              <li key={a.assessmentId} className="rounded-[16px] bg-[#f3f6fc] p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Badge variant={riskVariant(a.effectiveRiskLevel)} className="capitalize">{`${a.effectiveRiskLevel} risk`}</Badge>
                  {isOverridden(a) && (
                    <>
                      <Badge variant="neutral">Overridden</Badge>
                      <span className="text-[12.5px] capitalize text-[#5b6b85]">{`model: ${a.riskLevel}`}</span>
                    </>
                  )}
                  <span className="text-[13.5px] tabular-nums text-[#33405a]">{`Based on ${levelReason(a)}`}</span>
                  <span className="text-[12.5px] text-[#5b6b85]">{a.reviewStatus === "reviewed" ? "Signed off" : "Pending review"}</span>
                  <span className="ml-auto text-[12.5px] text-[#5b6b85]">{dateTime(a.createdAt)}</span>
                </div>
                {a.effectiveRecommendation && <p className="mt-2 text-[13.5px] leading-relaxed text-[#33405a]">{a.effectiveRecommendation}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/dashboard?assessment=${a.assessmentId}`} className={buttonClasses("secondary", "sm")}>
                    View on dashboard
                  </Link>
                  <Link to={`/assessments/${a.assessmentId}`} className={buttonClasses("ghost", "sm")}>
                    Details
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Encounters</CardTitle>
          {canManage && (
            <Button variant="secondary" size="sm" onClick={() => setEncounterOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add encounter
            </Button>
          )}
        </div>
        {encounters === null ? (
          encountersLoad.error ? (
            <div className="mt-3"><ErrorCard title="Couldn't load encounters." onRetry={encountersLoad.reload} /></div>
          ) : (
            <Skeleton className="mt-3 h-[100px]" />
          )
        ) : encounters.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-[#5b6b85]">No encounters recorded.</p>
        ) : (
          <ul className="mt-3.5 flex flex-col gap-2.5">
            {encounters.map((e) => (
              <EncounterItem key={e.encounterId} encounter={e} />
            ))}
          </ul>
        )}
      </Card>

      {editOpen && (
        <EditPatientModal
          patient={patient}
          onClose={() => setEditOpen(false)}
          onSaved={(p) => {
            setEdited(p);
            setEditOpen(false);
          }}
        />
      )}
      {encounterOpen && (
        <EncounterModal
          patientId={patient.patientId}
          onClose={() => setEncounterOpen(false)}
          onSaved={() => {
            setEncounterOpen(false);
            encountersLoad.reload();
          }}
        />
      )}
      <ConfirmModal
        open={removeOpen}
        title="Deactivate patient?"
        message={`${name} will be hidden from the patient list. Their assessments stay on record.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={remove}
        onClose={() => setRemoveOpen(false)}
      />
    </div>
  );
}
