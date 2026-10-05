import { useCallback, useEffect, useRef, useState } from "react";
import { getAuditLogEntries } from "../api/client";
import type { AuditLogEntry, AuditOutcome } from "../api/types";
import { Badge, Button, Card, PillTabs, type BadgeVariant, type PillTab } from "../ui";
import { ErrorCard, Skeleton } from "./dashboard/Panels";
import { formatDate } from "./dashboard/logic";
import { PageHeader } from "./PageHeader";

const PAGE_SIZE = 50;

type Filter = "all" | AuditOutcome;
const FILTERS: readonly PillTab<Filter>[] = [
  { value: "all", label: "All" },
  { value: "success", label: "Success" },
  { value: "denied", label: "Denied" },
  { value: "failure", label: "Failure" },
];

const OUTCOME_VARIANT: Record<string, BadgeVariant> = { success: "success", denied: "denied", failure: "failure" };

const TH = "px-4 py-3 text-left text-[12px] font-semibold text-[#5b6b85]";
const TD = "px-4 py-3 align-middle";

function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(iso)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function resourceOf(e: AuditLogEntry): string {
  const base = e.resourceType.replace(/_/g, " ") || "—";
  return e.resourceId ? `${base} #${e.resourceId}` : base;
}

export function AuditLog() {
  const [filter, setFilter] = useState<Filter>("all");
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Ignore responses that belong to a filter the user has since left.
  const request = useRef(0);

  const fetchPage = useCallback((outcome: Filter, offset: number) => {
    const id = request.current;
    return getAuditLogEntries(outcome === "all" ? undefined : outcome, { limit: PAGE_SIZE, offset }).then((rows) => {
      if (id !== request.current) return null;
      return rows;
    });
  }, []);

  const loadFirst = useCallback(
    (outcome: Filter) => {
      request.current += 1;
      setEntries(null);
      setError(null);
      setHasMore(false);
      fetchPage(outcome, 0).then(
        (rows) => {
          if (!rows) return;
          setEntries(rows);
          setHasMore(rows.length === PAGE_SIZE);
        },
        (e: unknown) => {
          setError(e instanceof Error && e.message ? e.message : "Couldn't load the audit log.");
        }
      );
    },
    [fetchPage]
  );

  useEffect(() => {
    loadFirst(filter);
    return () => {
      request.current += 1;
    };
  }, [filter, loadFirst]);

  async function loadMore() {
    if (!entries) return;
    setLoadingMore(true);
    setError(null);
    try {
      const rows = await fetchPage(filter, entries.length);
      if (!rows) return;
      setEntries((cur) => {
        const have = new Set((cur ?? []).map((e) => e.auditLogId));
        return [...(cur ?? []), ...rows.filter((e) => !have.has(e.auditLogId))];
      });
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't load more entries.");
    } finally {
      setLoadingMore(false);
    }
  }

  let body;
  if (entries === null) {
    body = error ? (
      <ErrorCard title={error} onRetry={() => loadFirst(filter)} />
    ) : (
      <Skeleton className="h-[320px] !rounded-[22px]" />
    );
  } else {
    body = (
      <Card className="!p-0">
        <div className="relative overflow-x-auto rounded-[22px]" tabIndex={0} role="region" aria-label="Audit log table">
          <table className="w-full min-w-[860px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-[#e6ebf4]">
                <th scope="col" className={TH}>Time</th>
                <th scope="col" className={TH}>Actor</th>
                <th scope="col" className={TH}>Action</th>
                <th scope="col" className={TH}>Resource</th>
                <th scope="col" className={TH}>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.auditLogId} className="border-b border-[#e6ebf4] last:border-b-0 hover:bg-[#f6f8fc]">
                  <td className={`${TD} whitespace-nowrap tabular-nums text-[#33405a]`}>{timeOf(e.createdAt)}</td>
                  <td className={`${TD} font-semibold text-[#0b1530]`}>{e.actorUsername}</td>
                  <td className={`${TD} text-[12px] font-bold uppercase tracking-[.04em] text-[#1446d1]`}>{e.actionType}</td>
                  <td className={`${TD} text-[#33405a]`}>
                    <span className="capitalize">{resourceOf(e)}</span>
                    {e.patientId != null && <span className="block text-[12px] text-[#5b6b85]">{`Patient #${e.patientId}`}</span>}
                  </td>
                  <td className={TD}>
                    <Badge variant={OUTCOME_VARIANT[e.outcome] ?? "neutral"} className="capitalize">
                      {e.outcome}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-[#5b6b85]">No entries for this filter.</p>}
        </div>
        {(hasMore || error) && (
          <div className="flex flex-col items-center gap-2 border-t border-[#e6ebf4] p-4">
            {error && (
              <p role="alert" className="text-[13px] font-semibold text-[#b91c1c]">
                {error}
              </p>
            )}
            {hasMore && (
              <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Audit log"
        subtitle="Every view, change and sign-in, newest first"
        action={<PillTabs tabs={FILTERS} value={filter} onChange={setFilter} label="Filter by outcome" />}
      />
      {body}
    </div>
  );
}
