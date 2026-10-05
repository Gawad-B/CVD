import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Avatar, Badge, Button, Card, CardTitle, cn, riskVariant } from "../../ui";
import { RISK_TONE } from "../../heart";
import type { DashboardStats, Model, RiskAssessment } from "../../api/types";
import { buildFactorRows, buildVitals, formatDate, isOverridden, recommendationMismatch } from "./logic";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-[14px] bg-[#e8eefb] motion-safe:animate-pulse", className)} />;
}

export function ErrorCard({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Card role="alert" className="flex flex-col items-start gap-3">
      <p className="text-[14px] font-semibold text-[#b91c1c]">{title}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </Card>
  );
}

export function VitalsCard({ assessment }: { assessment: RiskAssessment | null }) {
  const vitals = buildVitals(assessment?.inputs);
  return (
    <Card className="!p-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Latest encounter</CardTitle>
        <span className="whitespace-nowrap text-[12px] text-[#5b6b85]">{formatDate(assessment?.createdAt)}</span>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        {vitals.map((v) => (
          <div key={v.key} className="rounded-[16px] bg-[#f3f6fc] p-3.5">
            <div className="text-[12px] font-semibold text-[#5b6b85]">{v.label}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span
                data-abnormal={v.abnormal || undefined}
                className="text-[22px] font-bold tracking-[-0.02em] tabular-nums"
                style={{ color: v.abnormal ? "#dc2626" : "#0b1530" }}
              >
                {assessment ? v.value : "—"}
              </span>
              {assessment && v.abnormal && <span className="sr-only">{` (${v.flag})`}</span>}
              <span className="text-[11.5px] text-[#5b6b85]">{v.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export interface RecentRow {
  assessment: RiskAssessment;
  code: string;
}

export function RecentList({
  rows,
  selectedId,
  onSelect,
  hasQuery,
}: {
  rows: RecentRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  hasQuery: boolean;
}) {
  return (
    <Card className="!p-[18px]">
      <div className="flex items-center justify-between">
        <CardTitle>Recent assessments</CardTitle>
        <Link to="/assessments" className="text-[12.5px] font-semibold">
          View all
        </Link>
      </div>
      <ul className="mt-3.5 flex max-h-[460px] flex-col gap-2 overflow-y-auto">
        {rows.map(({ assessment: a, code }) => {
          const selected = a.assessmentId === selectedId;
          return (
            <li key={a.assessmentId}>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(a.assessmentId)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition-[background-color,transform] duration-[180ms] active:scale-[.98] motion-reduce:scale-none motion-reduce:active:scale-none",
                  selected ? "bg-[#1f5eff] text-white" : "bg-transparent text-[#0b1530] hover:bg-[#e8eefb]"
                )}
              >
                <Avatar
                  name={a.patientName}
                  size={38}
                  shape="square"
                  className={selected ? "!bg-white/20 !text-white" : "!bg-[#e6edff] !text-[#1446d1]"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{a.patientName}</span>
                  <span className="mt-0.5 block text-[12px] opacity-75">{code || `Assessment #${a.assessmentId}`}</span>
                </span>
                <Badge
                  variant={riskVariant(a.effectiveRiskLevel)}
                  className="shrink-0 capitalize"
                  style={selected ? { backgroundColor: "#fff", color: RISK_TONE[a.effectiveRiskLevel].color } : undefined}
                >
                  {a.effectiveRiskLevel}
                </Badge>
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && hasQuery && (
        <p className="px-2 py-[18px] text-center text-[13px] text-[#5b6b85]">No patients match that search.</p>
      )}
    </Card>
  );
}

export function FactorsCard({ assessment }: { assessment: RiskAssessment }) {
  const explanation = assessment.explanation;
  const rows = buildFactorRows(explanation?.contributions);
  const unavailable = !explanation || explanation.explanationError || rows.length === 0;
  return (
    <Card>
      <CardTitle>What drove this score</CardTitle>
      {unavailable ? (
        <p className="mt-3 text-[13px] text-[#5b6b85]">Factor explanation unavailable.</p>
      ) : (
        <>
          <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-7 gap-y-3.5">
            {rows.map((f) => (
              <li key={f.feature}>
                <div className="flex justify-between gap-2 text-[13px]">
                  <span className="text-[#33405a]">{f.label}</span>
                  <span className="font-bold tabular-nums">{f.pointsText}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-[3px] bg-[#eef2f9]">
                  <div
                    data-testid="factor-bar"
                    className="h-full rounded-[3px] transition-[width,background-color] duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)]"
                    style={{ width: `${f.pct}%`, backgroundColor: f.color }}
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] leading-snug text-[#5b6b85]">{f.sentence}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11.5px] text-[#5b6b85]">
            Model sensitivity: effect of changing each input alone to a typical-patient value. Not a measure of
            clinical risk-factor importance.
          </p>
        </>
      )}
    </Card>
  );
}

const DIST: Array<[string, string, string]> = [
  ["low", "Low", "#16a34a"],
  ["medium", "Medium", "#d97706"],
  ["high", "High", "#dc2626"],
];

export function OverviewCard({ stats }: { stats: DashboardStats }) {
  const tiles: Array<[string, number]> = [
    ["Patients", stats.totalPatients],
    ["Assessments", stats.totalAssessments],
    ["High risk", stats.highRisk],
    ["Pending review", stats.pendingReview],
  ];
  const counts = DIST.map(([k]) => Number(stats.riskDistribution?.[k] ?? 0));
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <Card className="!p-[18px]">
      <CardTitle>Overview</CardTitle>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-[16px] bg-[#f3f6fc] p-3.5">
            <div className="text-[12px] font-semibold text-[#5b6b85]">{label}</div>
            <div className="mt-2 text-[22px] font-bold tracking-[-0.02em] tabular-nums">{value.toLocaleString("en-US")}</div>
          </div>
        ))}
      </div>
      <div className="mt-[18px] text-[13px] font-semibold">Risk distribution</div>
      <div className="mt-2.5 flex h-2.5 gap-1" role="img" aria-label={`Risk distribution: ${DIST.map(([, l], i) => `${l} ${counts[i]}`).join(", ")}`}>
        {total === 0 ? (
          <span className="flex-1 rounded-[5px] bg-[#e8edf6]" />
        ) : (
          DIST.map(([k, , color], i) => (
            <span key={k} className="rounded-[5px]" style={{ flex: counts[i], background: color, display: counts[i] ? undefined : "none" }} />
          ))
        )}
      </div>
      <div className="mt-2 flex justify-between text-[12px] tabular-nums text-[#5b6b85]">
        {DIST.map(([k, label], i) => (
          <span key={k}>{`${label} ${counts[i].toLocaleString("en-US")}`}</span>
        ))}
      </div>
    </Card>
  );
}

interface RecommendationProps {
  assessment: RiskAssessment;
  canReview: boolean;
  signing: boolean;
  signError: string | null;
  notice: string | null;
  onSignOff: (comment: string) => void;
  onOverride: () => void;
}

export function RecommendationCard({ assessment, canReview, signing, signError, notice, onSignOff, onOverride }: RecommendationProps) {
  const [comment, setComment] = useState("");
  const reviewed = assessment.reviewStatus === "reviewed";
  const color = RISK_TONE[assessment.effectiveRiskLevel].color;
  const mismatch = recommendationMismatch(assessment);
  return (
    <Card className="!p-[18px]" style={{ borderTop: `3px solid ${color}` }}>
      <CardTitle>Recommendation</CardTitle>
      {mismatch && <p className="mt-2.5 text-[12px] font-semibold text-[#5b6b85]">{`Model recommendation for ${assessment.riskLevel} risk`}</p>}
      <p className={`${mismatch ? "mt-1" : "mt-2.5"} text-[14px] leading-[1.6] text-[#33405a] [text-wrap:pretty]`}>{assessment.effectiveRecommendation}</p>
      {mismatch && (
        <p role="note" className="mt-2 rounded-[12px] bg-[#fef3c7] px-3 py-2 text-[12.5px] font-semibold text-[#b45309]">
          Review: recommendation was written for the model's level.
        </p>
      )}
      {isOverridden(assessment) && assessment.overrideReason && (
        <p className="mt-2 text-[12px] text-[#5b6b85]">{`Override reason: ${assessment.overrideReason}`}</p>
      )}
      <p className="mt-3 text-[12px] text-[#5b6b85]">
        {reviewed
          ? `Signed off${assessment.reviewedByUsername ? ` by ${assessment.reviewedByUsername}` : ""}${
              assessment.reviewedAt ? ` · ${formatDate(assessment.reviewedAt)}` : ""
            }`
          : "Pending review"}
      </p>
      {assessment.reviewComment && <p className="mt-1 text-[12px] text-[#5b6b85]">{`Comment: ${assessment.reviewComment}`}</p>}
      {notice && (
        <p role="status" className="mt-2 rounded-[12px] bg-[#fef3c7] px-3 py-2 text-[12.5px] font-semibold text-[#b45309]">
          {notice}
        </p>
      )}
      <Link to={`/assessments/${assessment.assessmentId}`} className="mt-2 inline-block text-[12.5px] font-semibold">
        Full details
      </Link>
      {canReview && (
        <>
          {!reviewed && (
            <label className="mt-3 block text-[12px] font-semibold text-[#33405a]">
              Review comment (optional)
              <input
                value={comment}
                maxLength={500}
                onChange={(e) => setComment(e.target.value)}
                className="mt-1 h-10 w-full rounded-[12px] border border-[#d6deec] bg-white px-3 text-[13.5px] font-normal text-[#0b1530] focus:border-[#1f5eff]"
              />
            </label>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={reviewed || signing} onClick={() => onSignOff(comment.trim())}>
              {reviewed ? "Signed off" : signing ? "Signing off…" : "Sign off"}
            </Button>
            <Button variant="secondary" onClick={onOverride}>
              Override
            </Button>
          </div>
        </>
      )}
      {signError && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-[#b91c1c]">
          {signError}
        </p>
      )}
    </Card>
  );
}

export function ModelCard({ model, assessment }: { model: Model | null; assessment: RiskAssessment | null }) {
  const name = model ? `${model.modelName} v${model.modelVersion.replace(/^v/i, "")}` : assessment?.modelName ? `${assessment.modelName}${assessment.modelVersion ? ` v${assessment.modelVersion.replace(/^v/i, "")}` : ""}` : "—";
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const metrics: Array<[string, string]> = model
    ? [
        [model.auc.toFixed(3), "AUC"],
        [pct(model.recall), "Recall"],
        [pct(model.precision), "Precision"],
      ]
    : [];
  return (
    <Card className="!p-[18px]">
      <CardTitle>Active model</CardTitle>
      <div className="mt-1 text-[13px] text-[#5b6b85]">{name}</div>
      {metrics.length > 0 && (
        <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
          {metrics.map(([value, label]) => (
            <div key={label} className="rounded-[14px] bg-[#f3f6fc] px-1 py-2.5">
              <div className="text-[17px] font-bold tabular-nums">{value}</div>
              <div className="mt-0.5 text-[11.5px] text-[#5b6b85]">{label}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function PanelFrame({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-[18px]">{children}</div>;
}
