import { useState } from "react";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { getPatients } from "../api/client";
import type { Patient } from "../api/types";
import { useSearch } from "../context/SearchContext";
import { Avatar, Badge, Button, Card, buttonClasses, riskVariant } from "../ui";
import { AddPatientModal } from "./AddPatientModal";
import { ageFromDob } from "./dateOfBirth";
import { ErrorCard, Skeleton } from "./dashboard/Panels";
import { formatDate, matchesQuery, sexLabel } from "./dashboard/logic";
import { useLoader } from "./dashboard/useLoader";
import { PageHeader } from "./PageHeader";
import { riskSummary } from "./RiskResult";

const fullName = (p: Patient) => `${p.firstName} ${p.lastName}`.trim();

function sexAge(p: Patient): string {
  const age = ageFromDob(p.dateOfBirth);
  return [sexLabel(p.sex), age === null ? null : String(age)].filter(Boolean).join(", ") || "—";
}

const TH = "px-4 py-3 text-left text-[12px] font-semibold text-[#5b6b85]";
const TD = "px-4 py-3 align-middle";

export function PatientsList() {
  const { query } = useSearch();
  const loaded = useLoader(getPatients, "patients");
  const [created, setCreated] = useState<Patient[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const createdIds = new Set(created.map((p) => p.patientId));
  const patients = loaded.data === null ? null : [...created, ...loaded.data.filter((p) => !createdIds.has(p.patientId))];
  const rows = (patients ?? []).filter((p) => matchesQuery(fullName(p), p.externalPatientCode, query));

  const addButton = (
    <Button onClick={() => setModalOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      Add patient
    </Button>
  );

  let body;
  if (patients === null) {
    body = loaded.error ? (
      <ErrorCard title="Couldn't load patients." onRetry={loaded.reload} />
    ) : (
      <Skeleton className="h-[320px] !rounded-[22px]" />
    );
  } else if (patients.length === 0) {
    body = (
      <Card className="mx-auto flex max-w-[560px] flex-col items-center gap-3 py-12 text-center">
        <h2 className="text-[22px] font-bold tracking-[-0.02em] text-[#0b1530]">Add your first patient</h2>
        <p className="text-[14px] text-[#5b6b85]">Patients you add here can be screened on the Assessments page.</p>
        <Button className="mt-2" onClick={() => setModalOpen(true)}>
          Add patient
        </Button>
      </Card>
    );
  } else {
    body = (
      <Card className="!p-0">
        <div className="relative overflow-x-auto rounded-[22px]" tabIndex={0} role="region" aria-label="Patients table">
          <table className="w-full min-w-[760px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-[#e6ebf4]">
                <th scope="col" className={TH}>Patient</th>
                <th scope="col" className={TH}>Sex, age</th>
                <th scope="col" className={TH}>Last assessment</th>
                <th scope="col" className={TH}>Details</th>
                <th scope="col" className={TH}>Risk</th>
                <th scope="col" className={TH}>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const last = p.lastAssessment ?? null;
                const name = fullName(p);
                return (
                  <tr key={p.patientId} className="border-b border-[#e6ebf4] last:border-b-0 hover:bg-[#f6f8fc]">
                    <td className={TD}>
                      <div className="flex items-center gap-3">
                        <Avatar name={name} size={38} shape="square" className="!bg-[#e6edff] !text-[#1446d1]" />
                        <div className="min-w-0">
                          <Link
                            to={`/patients/${p.patientId}`}
                            className="block truncate text-[14px] font-semibold text-[#0b1530] hover:text-[#1446d1]"
                          >
                            {name}
                          </Link>
                          <span className="block text-[12px] text-[#5b6b85]">{p.externalPatientCode}</span>
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} text-[#33405a]`}>{sexAge(p)}</td>
                    <td className={`${TD} text-[#33405a]`}>{last ? formatDate(last.createdAt) : "—"}</td>
                    <td className={`${TD} tabular-nums text-[#33405a]`}>
                      {last
                        ? riskSummary({ ...last, overrideRiskLevel: last.effectiveRiskLevel !== last.riskLevel ? last.effectiveRiskLevel : null })
                        : "—"}
                    </td>
                    <td className={TD}>
                      {last ? (
                        <Badge variant={riskVariant(last.effectiveRiskLevel)} className="capitalize">
                          {last.effectiveRiskLevel}
                        </Badge>
                      ) : (
                        <Badge variant="pending" />
                      )}
                    </td>
                    <td className={`${TD} text-right`}>
                      {last ? (
                        <Link
                          to={`/dashboard?assessment=${last.assessmentId}`}
                          aria-label={`Open ${name} on the dashboard`}
                          className={buttonClasses("secondary", "sm")}
                        >
                          Open
                        </Link>
                      ) : (
                        <Link
                          to={`/assessments?patient=${p.patientId}`}
                          aria-label={`Assess ${name}`}
                          className={buttonClasses("primary", "sm")}
                        >
                          Assess
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-[#5b6b85]">No patients match that search.</p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Patients"
        subtitle={patients ? `${patients.length} ${patients.length === 1 ? "patient" : "patients"} in your clinic` : undefined}
        action={addButton}
        help="Click Add patient to register someone, then Open to see their history or run a new assessment. The Risk badge shows the latest result and Details says what decided it."
      />
      {body}
      <AddPatientModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={(p) => setCreated((prev) => [p, ...prev])} />
    </div>
  );
}
