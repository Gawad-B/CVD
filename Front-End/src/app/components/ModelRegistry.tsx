import { getModels } from "../api/client";
import type { Model } from "../api/types";
import { Badge, Card, cn } from "../ui";
import { ErrorCard, Skeleton } from "./dashboard/Panels";
import { useLoader } from "./dashboard/useLoader";
import { PageHeader } from "./PageHeader";

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

/** "stacked_pipeline" -> "Stacked pipeline". */
function algorithmLabel(raw: string): string {
  const text = raw.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}

function trainedOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ModelCard({ model }: { model: Model }) {
  const trained = trainedOn(model.trainedAt);
  const tiles: Array<[string, string]> = [
    ["AUC", model.auc.toFixed(3)],
    ["Recall", pct(model.recall)],
    ["Precision", pct(model.precision)],
    ["Accuracy", pct(model.accuracy)],
    ["F1", model.f1Score.toFixed(3)],
    ["Algorithm", algorithmLabel(model.algorithm)],
  ];
  return (
    <Card
      data-testid="model-card"
      data-active={model.isActive || undefined}
      className={cn("flex flex-col gap-4 border-2 border-transparent", model.isActive && "!border-[#1f5eff]")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold leading-tight text-[#0b1530]">{model.modelName}</h2>
          <p className="mt-1 text-[13px] text-[#5b6b85]">
            {`v${model.modelVersion.replace(/^v/i, "")}`}
            {trained ? ` · trained ${trained}` : ""}
          </p>
        </div>
        <Badge variant={model.isActive ? "success" : "neutral"}>{model.isActive ? "Active" : "Retired"}</Badge>
      </div>
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
      {model.isActive && (
        <button
          type="button"
          disabled
          className="h-[42px] rounded-full bg-[#e6edff] px-5 text-[13.5px] font-semibold text-[#1446d1] opacity-60"
        >
          Scoring new encounters
        </button>
      )}
    </Card>
  );
}

export function ModelRegistry() {
  const loaded = useLoader(getModels, "models");
  const models = loaded.data;

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
    // Active first, then newest.
    const sorted = [...models].sort(
      (a, b) => Number(b.isActive) - Number(a.isActive) || b.trainedAt.localeCompare(a.trainedAt)
    );
    body = (
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-[18px]">
        {sorted.map((m) => (
          <li key={m.modelId} className="flex min-w-0 flex-col [&>*]:flex-1">
            <ModelCard model={m} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Model registry" subtitle="Only one model scores new encounters at a time" />
      {body}
      <p className="text-[12.5px] text-[#5b6b85]">Calibrated to NHANES 2021–2023 adults (existing diagnosed CVD); decision support only.</p>
    </div>
  );
}
