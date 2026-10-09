import { HelpHint } from "../ui/InfoTip";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  getDashboardStats,
  getModels,
  getRiskAssessmentById,
  getRiskAssessments,
  updateRiskAssessmentReviewStatus,
} from "../api/client";
import type { OverrideResult, RiskAssessment } from "../api/types";
import { MODELS_ROLES, hasRoleAccess } from "../auth/permissions";
import { useAuth } from "../context/AuthContext";
import { useSearch } from "../context/SearchContext";
import { Card, buttonClasses } from "../ui";
import { HeartStage } from "./dashboard/HeartStage";
import { OverrideModal } from "./dashboard/OverrideModal";
import {
  ErrorCard,
  FactorsCard,
  ModelCard,
  OverviewCard,
  PanelFrame,
  RecentList,
  RecommendationCard,
  Skeleton,
  VitalsCard,
  type RecentRow,
} from "./dashboard/Panels";
import { matchesQuery, patientMeta } from "./dashboard/logic";
import { useLoader } from "./dashboard/useLoader";

const GRID =
  "mt-5 grid grid-cols-1 items-start gap-[18px] min-[1181px]:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(260px,320px)]";

export function Dashboard() {
  const { user } = useAuth();
  const { query } = useSearch();
  const [params, setParams] = useSearchParams();
  const canReview = user?.role !== "auditor";
  const canViewModels = hasRoleAccess(user?.role, MODELS_ROLES);

  const list = useLoader(() => getRiskAssessments({ limit: 50 }), "list");
  const stats = useLoader(getDashboardStats, "stats");
  const models = useLoader(getModels, "models", canViewModels);

  const requested = Number(params.get("assessment"));
  const selectedId = Number.isInteger(requested) && requested > 0 ? requested : null;

  const detail = useLoader(
    () => getRiskAssessmentById(selectedId as number),
    selectedId,
    selectedId != null && list.data !== null,
  );

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [signingId, setSigningId] = useState<number | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);

  const codeFor = (a: RiskAssessment) => a.externalPatientCode ?? "";

  const rows: RecentRow[] = useMemo(
    () =>
      (list.data ?? [])
        .map((assessment) => ({ assessment, code: assessment.externalPatientCode ?? "" }))
        .filter((r) => matchesQuery(r.assessment.patientName, r.code, query)),
    [list.data, query],
  );

  // Pin the default selection into the URL so a later list refresh can never swap the patient on screen.
  const needsPin = selectedId == null && list.data !== null && list.data.length > 0;
  useEffect(() => {
    if (!needsPin || !list.data) return;
    const pick = rows[0]?.assessment ?? list.data[0];
    setParams({ assessment: String(pick.assessmentId) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsPin]);

  const select = (id: number) => {
    setSignError(null);
    setParams({ assessment: String(id) }, { replace: true });
  };

  const assessment = detail.data;
  const refreshAll = () => {
    detail.reload();
    list.reload();
    stats.reload();
  };

  async function signOff(comment: string) {
    if (!assessment) return;
    const id = assessment.assessmentId;
    setSigningId(id);
    setSignError(null);
    setNotice(null);
    try {
      await updateRiskAssessmentReviewStatus(id, "reviewed", comment || undefined);
      refreshAll();
    } catch (e) {
      setSignError(e instanceof Error && e.message ? e.message : "Could not sign off. Try again.");
    } finally {
      setSigningId((cur) => (cur === id ? null : cur));
    }
  }

  function onOverrideSaved(_result: OverrideResult, wasReviewed: boolean) {
    setOverrideOpen(false);
    setNotice(
      wasReviewed
        ? { id: assessment!.assessmentId, text: "Override saved. The assessment returned to “Pending review”." }
        : { id: assessment!.assessmentId, text: "Override saved." },
    );
    refreshAll();
  }

  const empty = list.data !== null && list.data.length === 0;

  const statsCard = stats.data ? (
    <OverviewCard stats={stats.data} />
  ) : stats.error ? (
    <ErrorCard title="Couldn't load the overview." onRetry={stats.reload} />
  ) : (
    <Skeleton className="h-[260px]" />
  );

  if (list.data === null && list.error) {
    return (
      <div className="mt-5">
        <h1 className="sr-only">Dashboard</h1>
        <ErrorCard title="Couldn't load assessments." onRetry={list.reload} />
      </div>
    );
  }

  if (empty) {
    return (
      <div className="mt-5">
        <h1 className="sr-only">Dashboard</h1>
        <Card className="mx-auto flex max-w-[560px] flex-col items-center gap-3 py-12 text-center">
          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-[#0b1530]">No assessments yet</h2>
          <p className="text-[14px] text-[#5b6b85]">Run a risk assessment for a patient and it will show up here.</p>
          <Link to="/assessments" className={buttonClasses("primary", "md", "mt-2")}>
            Go to Assessments
          </Link>
        </Card>
      </div>
    );
  }

  const model = models.data?.find((m) => m.isActive) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Dashboard</h1>
      <HelpHint>
        Pick a patient on the left to see their heart, readings and result. The heart’s colour shows the risk level (green low, amber
        medium, red high). On the right: the recommendation, with <strong>Sign off</strong> once you have reviewed it or{" "}
        <strong>Override</strong> to change the level.
      </HelpHint>
    <div className={GRID}>

      <PanelFrame>
        <VitalsCard assessment={assessment} />
        {list.data !== null && list.error && (
          <ErrorCard title="Couldn't refresh assessments." onRetry={list.reload} />
        )}
        {list.data === null ? (
          <Skeleton className="h-[320px]" />
        ) : (
          <RecentList rows={rows} selectedId={selectedId} onSelect={select} hasQuery={query.trim() !== ""} />
        )}
      </PanelFrame>

      <PanelFrame>
        {assessment ? (
          <>
            <HeartStage
              assessment={assessment}
              code={codeFor(assessment) || `Patient #${assessment.patientId}`}
              meta={patientMeta(assessment)}
            />
            <FactorsCard assessment={assessment} />
          </>
        ) : detail.error ? (
          <ErrorCard title="Couldn't load this assessment." onRetry={detail.reload} />
        ) : (
          <>
            <Skeleton className="h-[540px] !rounded-[26px]" />
            <Skeleton className="h-[160px]" />
          </>
        )}
      </PanelFrame>

      <PanelFrame>
        {statsCard}
        {assessment ? (
          <RecommendationCard
            key={assessment.assessmentId}
            assessment={assessment}
            canReview={canReview}
            signing={signingId === assessment.assessmentId}
            signError={signError}
            notice={notice && notice.id === assessment.assessmentId ? notice.text : null}
            onSignOff={signOff}
            onOverride={() => setOverrideOpen(true)}
          />
        ) : (
          <Skeleton className="h-[200px]" />
        )}
        <ModelCard model={model} assessment={assessment} />
      </PanelFrame>

      {overrideOpen && assessment && (
        <OverrideModal assessment={assessment} onClose={() => setOverrideOpen(false)} onSaved={onOverrideSaved} />
      )}
    </div>
    </div>
  );
}
