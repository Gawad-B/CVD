import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { deleteRiskAssessment, getRiskAssessmentById, updateRiskAssessmentReviewStatus } from "../api/client";
import { ApiError } from "../api/errors";
import type { RiskAssessment } from "../api/types";
import { PATIENTS_ROLES, hasRoleAccess, type Role } from "../auth/permissions";
import { useAuth } from "../context/AuthContext";
import { Badge, Button, Card, CardTitle, ConfirmModal, buttonClasses, riskVariant } from "../ui";
import { ACTIVITY_UNIT_OPTIONS, EDUCATION_OPTIONS, FEATURE_LABELS, RACE_OPTIONS, SCORE_DISCLAIMER } from "./clinicalConstants";
import { OverrideModal } from "./dashboard/OverrideModal";
import { ErrorCard, FactorsCard, Skeleton } from "./dashboard/Panels";
import { formatDate, isOverridden, patientMeta, recommendationMismatch, sexLabel } from "./dashboard/logic";
import { useLoader } from "./dashboard/useLoader";
import { formatFactorValue } from "./formatFactorValue";

const textarea =
  "w-full rounded-[12px] border border-[#d6deec] bg-white px-3.5 py-3 text-[14px] leading-relaxed text-[#0b1530] placeholder:text-[#8fa1c4] focus:border-[#1f5eff]";

/** Backend only lets admin and doctor delete assessments. */
const DELETE_ROLES: readonly Role[] = ["admin", "doctor"];

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(iso)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

const YES_NO: Record<string, string> = { "1": "Yes", "2": "No", "3": "Borderline" };
const optionLabel = (options: Array<{ value: string; label: string }>) => (raw: string) =>
  options.find((o) => o.value === raw)?.label;

const CODED: Record<string, (raw: string) => string | undefined> = {
  SMQ020: (r) => YES_NO[r],
  DIQ010: (r) => YES_NO[r],
  BPQ020: (r) => YES_NO[r],
  BPQ080: (r) => YES_NO[r],
  BPQ101D: (r) => YES_NO[r],
  RXQ033: (r) => YES_NO[r],
  RIAGENDR: (r) => sexLabel(r) ?? undefined,
  RIDRETH3: optionLabel(RACE_OPTIONS),
  DMDEDUC2: optionLabel(EDUCATION_OPTIONS),
  PAD790U: optionLabel(ACTIVITY_UNIT_OPTIONS),
};

const UNIT_LETTERS: Record<string, string> = { D: "Day", W: "Week", M: "Month", Y: "Year" };

/**
 * Human text for a raw model input; null when it was not recorded. The backend stores categoricals
 * as text ("Yes", "Female", "W"); older rows may hold numeric NHANES codes.
 */
export function inputText(column: string, raw: number | string | null | undefined): string | null {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return null;
  if (column in CODED) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && String(raw).trim() !== "") {
      const code = String(numeric);
      return CODED[column](code) ?? `Unknown (${code})`;
    }
    const text = String(raw).trim();
    if (column === "PAD790U") return UNIT_LETTERS[text.toUpperCase()] ?? text;
    return text;
  }
  return formatFactorValue(raw);
}

const riskText = (level: string) => `${level} risk`;

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardTitle>{title}</CardTitle>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[14px] bg-[#f3f6fc] p-3.5">
      <dt className="text-[12px] font-semibold text-[#5b6b85]">{label}</dt>
      <dd className="mt-1 text-[15px] font-semibold text-[#0b1530]">{children}</dd>
    </div>
  );
}

export function RiskAssessmentDetails() {
  const { assessmentId } = useParams();
  const id = Number(assessmentId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const canReview = hasRoleAccess(user?.role, PATIENTS_ROLES);
  const canWrite = hasRoleAccess(user?.role, DELETE_ROLES);
  const canOpenPatient = canReview;

  const detail = useLoader(() => getRiskAssessmentById(id), id, Boolean(id));
  const [comment, setComment] = useState("");
  const [signing, setSigning] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const back = (
    <Link to="/assessments" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#33405a] hover:text-[#1446d1]">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to assessments
    </Link>
  );

  const a = detail.data;
  if (!a) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        {!id || (detail.error && !detail.loading) ? (
          detail.error && id && !(detail.error instanceof ApiError && detail.error.status === 404) ? (
            <ErrorCard title="Couldn't load this assessment." onRetry={detail.reload} />
          ) : (
            <Card className="mx-auto flex max-w-[560px] flex-col items-center gap-2 py-12 text-center">
              <h1 className="text-[22px] font-bold text-[#0b1530]">Risk assessment not found</h1>
            </Card>
          )
        ) : (
          <Skeleton className="h-[320px] !rounded-[22px]" />
        )}
      </div>
    );
  }

  const assessment: RiskAssessment = a;
  const overridden = isOverridden(assessment);
  const reviewed = assessment.reviewStatus === "reviewed";
  const meta = patientMeta(assessment);
  const explanation = assessment.explanation;
  const missingLabels = (explanation?.missingInputs ?? []).map((c) => FEATURE_LABELS[c] ?? c);
  const modelVersion = (explanation?.modelVersion ?? assessment.modelVersion)?.replace(/^v/i, "");
  const history = [...(assessment.overrideHistory ?? [])].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const heartRate = assessment.heartRate ?? null;

  async function signOff() {
    setSigning(true);
    setActionError(null);
    setNotice(null);
    try {
      await updateRiskAssessmentReviewStatus(assessment.assessmentId, "reviewed", comment.trim() || undefined);
      setComment("");
      detail.reload();
    } catch (e) {
      setActionError(errorText(e, "Could not sign off. Try again."));
    } finally {
      setSigning(false);
    }
  }

  async function remove() {
    setActionError(null);
    try {
      await deleteRiskAssessment(assessment.assessmentId);
      navigate("/assessments");
    } catch (e) {
      setDeleteOpen(false);
      setActionError(errorText(e, "Could not remove the assessment."));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {back}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[clamp(24px,2.4vw,30px)] font-bold leading-tight tracking-[-0.03em] text-[#0b1530]">
              {assessment.patientName}
            </h1>
            <p className="mt-1 text-[14px] text-[#5b6b85]">
              {[`Assessment #${assessment.assessmentId}`, dateTime(assessment.createdAt)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/dashboard?assessment=${assessment.assessmentId}`} className={buttonClasses("secondary")}>
              View heart on dashboard
            </Link>
            {canReview && (
              <Button variant="secondary" onClick={() => setOverrideOpen(true)}>
                Override
              </Button>
            )}
            {canWrite && (
              <Button variant="secondary" onClick={() => setDeleteOpen(true)} className="!border-[#fecaca] !text-[#b91c1c] hover:!border-[#dc2626]">
                Delete
              </Button>
            )}
          </div>
        </div>
        {notice && (
          <p role="status" className="mt-4 rounded-[12px] bg-[#fef3c7] px-4 py-3 text-[13px] font-semibold text-[#b45309]">
            {notice}
          </p>
        )}
        {actionError && (
          <p role="alert" className="mt-4 rounded-[12px] bg-[#fee2e2] px-4 py-3 text-[13px] font-semibold text-[#b91c1c]">
            {actionError}
          </p>
        )}
        <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <Fact label="Patient">
            {canOpenPatient ? (
              <Link to={`/patients/${assessment.patientId}`} className="text-[#1446d1] hover:underline">
                {assessment.patientName}
              </Link>
            ) : (
              assessment.patientName
            )}
            <span className="block text-[12.5px] font-normal text-[#5b6b85]">
              {[assessment.externalPatientCode, meta].filter(Boolean).join(" · ")}
            </span>
          </Fact>
          <Fact label="Model score">
            <span className="tabular-nums">{`${(assessment.probabilityCvd * 100).toFixed(1)}%`}</span>
            <span className="block text-[12.5px] font-normal text-[#5b6b85]">
              {`${assessment.modelName}${modelVersion ? ` v${modelVersion}` : ""}`}
            </span>
          </Fact>
          <Fact label="Model risk">
            <Badge variant={riskVariant(assessment.riskLevel)} className="capitalize">
              {riskText(assessment.riskLevel)}
            </Badge>
          </Fact>
          <Fact label={overridden ? "Effective risk (overridden)" : "Effective risk"}>
            <Badge variant={riskVariant(assessment.effectiveRiskLevel)} className="capitalize">
              {riskText(assessment.effectiveRiskLevel)}
            </Badge>
          </Fact>
        </dl>
      </Card>

      <Section title="Recommendation">
        {recommendationMismatch(assessment) && (
          <p className="mb-1 text-[12px] font-semibold text-[#5b6b85]">{`Model recommendation for ${assessment.riskLevel} risk`}</p>
        )}
        <p className="text-[14px] leading-[1.6] text-[#33405a]">{assessment.effectiveRecommendation || "No recommendation provided."}</p>
        {recommendationMismatch(assessment) && (
          <p role="note" className="mt-3 rounded-[12px] bg-[#fef3c7] px-3.5 py-2.5 text-[13px] font-semibold text-[#b45309]">
            Review: recommendation was written for the model's level.
          </p>
        )}
        {overridden && assessment.recommendation && assessment.recommendation !== assessment.effectiveRecommendation && (
          <p className="mt-3 rounded-[12px] bg-[#f3f6fc] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#5b6b85]">
            <span className="font-semibold text-[#33405a]">Model’s original recommendation: </span>
            {assessment.recommendation}
          </p>
        )}
      </Section>

      {(overridden || history.length > 0) && (
        <Section title="Override">
          {overridden ? (
          <p className="text-[13.5px] text-[#33405a]">
            {`Overridden${assessment.overriddenByUsername ? ` by ${assessment.overriddenByUsername}` : ""}${
              assessment.overriddenAt ? ` on ${dateTime(assessment.overriddenAt)}` : ""
            }.`}
            {assessment.overrideReason && ` Reason: ${assessment.overrideReason}`}
          </p>
          ) : (
            <p className="text-[13.5px] text-[#33405a]">No override is currently active.</p>
          )}
          {history.length > 0 && (
            <ol aria-label="Override history" className="mt-4 flex flex-col gap-3 border-l-2 border-[#d6deec] pl-4">
              {history.map((h, i) => (
                <li key={`${h.createdAt}-${i}`} className="text-[13px] text-[#33405a]">
                  <div className="text-[12px] font-semibold text-[#5b6b85]">
                    {[dateTime(h.createdAt), h.overriddenByUsername].filter(Boolean).join(" · ")}
                  </div>
                  {!h.riskLevel && !h.recommendation && <div className="mt-1 font-semibold">Override removed</div>}
                  {h.riskLevel && (
                    <div className="mt-1">
                      Risk level set to <span className="font-semibold capitalize">{h.riskLevel}</span>
                    </div>
                  )}
                  {h.recommendation && <div className="mt-1">{`Recommendation: ${h.recommendation}`}</div>}
                  <div className="mt-1 text-[#5b6b85]">{`Reason: ${h.reason}`}</div>
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}

      <FactorsCard assessment={assessment} />

      {missingLabels.length > 0 && (
        <Section title="Estimated inputs">
          <p className="text-[13.5px] text-[#33405a]">{missingLabels.join(", ")}</p>
          <p className="mt-1 text-[12px] text-[#5b6b85]">Not provided — estimated by the model from population medians.</p>
        </Section>
      )}

      <Section title="Inputs">
        <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(FEATURE_LABELS).map(([column, label]) => {
            const text = inputText(column, assessment.inputs?.[column]);
            return (
              <div key={column} className="flex items-baseline justify-between gap-3 border-b border-[#e6ebf4] py-2 text-[13.5px]">
                <dt className="text-[#5b6b85]">{label}</dt>
                <dd className={text === null ? "text-[#8fa1c4]" : "font-semibold tabular-nums text-[#0b1530]"}>
                  {text ?? "Not recorded"}
                </dd>
              </div>
            );
          })}
          <div className="flex items-baseline justify-between gap-3 border-b border-[#e6ebf4] py-2 text-[13.5px]">
            <dt className="text-[#5b6b85]">Heart rate (not used by the model)</dt>
            <dd className={heartRate === null ? "text-[#8fa1c4]" : "font-semibold tabular-nums text-[#0b1530]"}>
              {heartRate === null ? "Not recorded" : `${heartRate} bpm`}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Review">
        {reviewed ? (
          <>
            <p className="text-[13.5px] text-[#33405a]">
              {`Signed off${assessment.reviewedByUsername ? ` by ${assessment.reviewedByUsername}` : ""}${
                assessment.reviewedAt ? ` · ${formatDate(assessment.reviewedAt)}` : ""
              }`}
            </p>
            {assessment.reviewComment && (
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-[#5b6b85]">{`Comment: ${assessment.reviewComment}`}</p>
            )}
          </>
        ) : (
          <>
            <p className="text-[13.5px] text-[#33405a]">Pending review</p>
            {canReview && (
              <div className="mt-3 flex flex-col gap-2.5">
                <label htmlFor="review-comment" className="text-[13px] font-semibold text-[#33405a]">
                  Review comment (optional)
                </label>
                <textarea
                  id="review-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  className={textarea}
                />
                <div>
                  <Button onClick={() => void signOff()} disabled={signing}>
                    {signing ? "Signing off…" : "Sign off"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      <p className="px-1 text-[12px] leading-relaxed text-[#5b6b85]">
        {`Decision support only. This estimate does not replace clinical judgement. ${SCORE_DISCLAIMER}`}
      </p>

      {overrideOpen && (
        <OverrideModal
          assessment={assessment}
          onClose={() => setOverrideOpen(false)}
          onSaved={(_result, wasReviewed) => {
            setOverrideOpen(false);
            setNotice(wasReviewed ? "Override saved. The assessment returned to “Pending review”." : "Override saved.");
            detail.reload();
          }}
        />
      )}
      <ConfirmModal
        open={deleteOpen}
        title="Delete assessment?"
        message={`${assessment.patientName}${assessment.externalPatientCode ? ` · ${assessment.externalPatientCode}` : ""}. The assessment will be removed from all lists (kept in the audit trail).`}
        confirmLabel="Delete"
        danger
        onConfirm={remove}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
