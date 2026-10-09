import { useState } from "react";
import { activateModel, getModels } from "../api/client";
import type { Model } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { Badge, Button, Card, ConfirmModal, cn } from "../ui";
import { ErrorCard, Skeleton } from "./dashboard/Panels";
import { useLoader } from "./dashboard/useLoader";
import { PageHeader } from "./PageHeader";

const pct = (n: number | undefined) => (n === undefined ? "—" : `${Math.round(n * 1000) / 10}%`);

function trainedOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_BADGE = {
  active: { variant: "success", text: "Active" },
  available: { variant: "neutral", text: "Available" },
  retired: { variant: "neutral", text: "Retired" },
} as const;

function ModelCard({ model, canActivate, onActivate }: { model: Model; canActivate: boolean; onActivate: (m: Model) => void }) {
  const trained = trainedOn(model.trainedAt);
  const tiles: Array<[string, string]> = [
    ["AUC", model.auc.toFixed(3)],
    ["Sensitivity", pct(model.recall)],
    ["Specificity", pct(model.specificity)],
    ["Precision (PPV)", pct(model.precision)],
    ["NPV", pct(model.npv)],
    ["PR-AUC", model.prAuc === undefined ? "—" : model.prAuc.toFixed(3)],
  ];
  const badge = STATUS_BADGE[model.status];
  return (
    <Card
      data-testid="model-card"
      data-active={model.isActive || undefined}
      className={cn("flex flex-col gap-4 border-2 border-transparent", model.isActive && "!border-[#1f5eff]", model.status === "retired" && "opacity-70")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold leading-tight text-[#0b1530]">{model.modelName}</h2>
          <p className="mt-1 text-[13px] text-[#5b6b85]">
            {`v${model.modelVersion.replace(/^v/i, "")}`}
            {trained ? ` · trained ${trained}` : ""}
          </p>
        </div>
        <Badge variant={badge.variant}>{badge.text}</Badge>
      </div>
      {(model.scoreMeaning || model.description) && (
        <p className="text-[13px] leading-relaxed text-[#33405a]">
          {model.scoreMeaning && <span className="font-semibold">{`Score: ${model.scoreMeaning}. `}</span>}
          {model.description}
        </p>
      )}
      {model.scoreCaveat && <p className="rounded-[12px] bg-[#fef3c7] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#92400e]">{model.scoreCaveat}</p>}
      <dl className="grid grid-cols-2 gap-2.5 min-[481px]:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col-reverse rounded-[14px] bg-[#f3f6fc] px-2 py-3 text-center">
            <dt className="mt-0.5 text-[11.5px] text-[#5b6b85]">{label}</dt>
            <dd className="truncate text-[16px] font-bold tabular-nums text-[#0b1530]" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[12px] text-[#5b6b85]">
        {[
          model.aucCi95 && `AUC 95% CI ${model.aucCi95[0].toFixed(3)}–${model.aucCi95[1].toFixed(3)}`,
          model.nTest !== undefined && `held-out test set of ${model.nTest.toLocaleString("en-GB")} people`,
          model.ageMin !== undefined && model.ageMax !== undefined && `trained on ages ${model.ageMin}–${model.ageMax}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {model.isActive ? (
        <button
          type="button"
          disabled
          className="h-[42px] rounded-full bg-[#e6edff] px-5 text-[13.5px] font-semibold text-[#1446d1] opacity-60"
        >
          Scoring new encounters
        </button>
      ) : (
        canActivate &&
        model.status === "available" && (
          <Button variant="secondary" onClick={() => onActivate(model)}>
            Use this model
          </Button>
        )
      )}
    </Card>
  );
}

export function ModelRegistry() {
  const loaded = useLoader(getModels, "models");
  const { user } = useAuth();
  const [pending, setPending] = useState<Model | null>(null);
  const [error, setError] = useState("");
  const models = loaded.data;
  const canActivate = user?.role === "admin";

  async function confirmActivate() {
    if (!pending) return;
    setError("");
    try {
      await activateModel(pending.modelId);
      setPending(null);
      loaded.reload();
    } catch (e) {
      setPending(null);
      setError(e instanceof Error && e.message ? e.message : "Couldn't switch the model. Try again.");
    }
  }

  let body;
  if (models === null) {
    body = loaded.error ? (
      <ErrorCard title="Couldn't load models." onRetry={loaded.reload} />
    ) : (
      <Skeleton className="h-[260px] !rounded-[22px]" />
    );
  } else if (models.length === 0) {
    body = (
      <Card className="mx-auto flex max-w-[560px] flex-col items-center gap-2 py-12 text-center">
        <h2 className="text-[20px] font-bold text-[#0b1530]">No models registered</h2>
        <p className="text-[14px] text-[#5b6b85]">A model appears here once it has been loaded for scoring.</p>
      </Card>
    );
  } else {
    // Active first, then installed, then retired; newest first within each.
    const rank = { active: 0, available: 1, retired: 2 } as const;
    const sorted = [...models].sort((a, b) => rank[a.status] - rank[b.status] || b.trainedAt.localeCompare(a.trainedAt));
    body = (
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-[18px]">
        {sorted.map((m) => (
          <li key={m.modelId} className="flex min-w-0 flex-col [&>*]:flex-1">
            <ModelCard model={m} canActivate={canActivate} onActivate={setPending} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Model registry" subtitle="Only one model scores new encounters at a time" />
      {error && (
        <p role="alert" className="rounded-[12px] bg-[#fee2e2] px-4 py-3 text-[13px] font-semibold text-[#b91c1c]">
          {error}
        </p>
      )}
      {body}
      <p className="text-[12.5px] text-[#5b6b85]">
        Switching changes how new assessments are scored; existing assessments keep the model that scored them. Decision support only.
      </p>
      <ConfirmModal
        open={pending !== null}
        title="Switch the active model?"
        message={pending ? `New assessments will be scored by ${pending.modelName} v${pending.modelVersion}. Existing assessments are not changed.` : ""}
        confirmLabel="Use this model"
        onConfirm={confirmActivate}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
