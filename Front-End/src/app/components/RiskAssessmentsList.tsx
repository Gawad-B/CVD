import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { getPatients, getRiskAssessments } from "../api/client";
import type { RiskAssessment, RiskLevel } from "../api/types";
import { PATIENTS_ROLES, hasRoleAccess } from "../auth/permissions";
import { useAuth } from "../context/AuthContext";
import { Avatar, Badge, Card, CardTitle, PillTabs, buttonClasses, riskVariant, type PillTab } from "../ui";
import { NewAssessmentForm } from "./assessments/NewAssessmentForm";
import { ErrorCard, Skeleton } from "./dashboard/Panels";
import { formatDate } from "./dashboard/logic";
import { useLoader } from "./dashboard/useLoader";
import { PageHeader } from "./PageHeader";
import { levelReason } from "./formatScore";

type Filter = "all" | RiskLevel;

const FILTER_TABS: readonly PillTab<Filter>[] = [
  { value: "all", label: "All" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function PastAssessments({
  items,
  filter,
  onRetry,
  error,
}: {
  items: RiskAssessment[] | null;
  filter: Filter;
  error: boolean;
  onRetry: () => void;
}) {
  if (items === null) {
    return error ? <ErrorCard title="Couldn't load assessments." onRetry={onRetry} /> : <Skeleton className="h-[320px] !rounded-[22px]" />;
  }
  const rows = items.filter((a) => filter === "all" || a.effectiveRiskLevel === filter);
  return (
    <Card>
      <CardTitle>Past assessments</CardTitle>
      {error && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-[#fee2e2] px-3.5 py-2.5 text-[13px] text-[#b91c1c]">
          <span>Couldn't refresh the list. The rows below may be out of date.</span>
          <button type="button" onClick={onRetry} className="rounded-full px-2.5 py-1 font-semibold underline hover:bg-white/60">
            Retry
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="px-2 py-8 text-center text-[13px] text-[#5b6b85]">
          {filter === "all" ? "No assessments yet." : "No assessments at this risk level."}
        </p>
      ) : (
        <ul className="mt-3.5 flex flex-col gap-1">
          {rows.map((a) => (
            <li key={a.assessmentId} className="flex items-center gap-1 rounded-[16px] transition-colors duration-[180ms] hover:bg-[#e8eefb]">
              <Link
                to={`/dashboard?assessment=${a.assessmentId}`}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-3 py-2.5 text-[#0b1530]"
              >
                <Avatar name={a.patientName} size={38} shape="square" className="!bg-[#e6edff] !text-[#1446d1]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{a.patientName}</span>
                  <span className="mt-0.5 block text-[12px] text-[#5b6b85]">
                    {[a.externalPatientCode, formatDate(a.createdAt), a.reviewStatus === "reviewed" ? "Signed off" : "Pending review"]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="text-[14px] font-semibold tabular-nums text-[#33405a]">
                  <span className="sr-only">Level based on </span>
                  {levelReason(a)}
                </span>
                <Badge variant={riskVariant(a.effectiveRiskLevel)} className="shrink-0 capitalize">
                  {a.effectiveRiskLevel}
                </Badge>
              </Link>
              <Link
                to={`/assessments/${a.assessmentId}`}
                aria-label={`Details for ${a.patientName}`}
                className="mr-2 shrink-0 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-[#1446d1] hover:bg-white"
              >
                Details
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RiskAssessmentsList() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  // Auditors are read-only: they browse past assessments but get no form (and may not list patients).
  const canCreate = hasRoleAccess(user?.role, PATIENTS_ROLES);

  const list = useLoader(() => getRiskAssessments({ limit: 100 }), "list");
  const patients = useLoader(getPatients, "patients", canCreate);

  const requested = Number(params.get("patient"));
  const preselect = Number.isInteger(requested) && requested > 0 ? requested : null;

  const past = (
    <PastAssessments items={list.data} filter={filter} error={list.error !== null} onRetry={list.reload} />
  );

  let form = null;
  if (canCreate) {
    if (patients.data) {
      form =
        patients.data.length === 0 ? (
          <Card className="flex flex-col items-start gap-3">
            <CardTitle>New assessment</CardTitle>
            <p className="text-[14px] text-[#5b6b85]">Add a patient first, then run their assessment here.</p>
            <Link to="/patients" className={buttonClasses("primary", "md")}>
              Go to Patients
            </Link>
          </Card>
        ) : (
          <NewAssessmentForm key={preselect ?? "none"} patients={patients.data} initialPatientId={preselect} onCreated={list.reload} />
        );
    } else {
      form = patients.error ? (
        <ErrorCard title="Couldn't load patients." onRetry={patients.reload} />
      ) : (
        <Skeleton className="h-[420px] !rounded-[22px]" />
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Risk assessments"
        subtitle="Past results and new screenings"
        action={<PillTabs tabs={FILTER_TABS} value={filter} onChange={setFilter} label="Filter by risk level" />}
      />
      {canCreate ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-start gap-[18px]">
          {past}
          {form}
        </div>
      ) : (
        past
      )}
    </div>
  );
}
