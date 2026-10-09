import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { Bell, LogOut, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { SearchProvider, useSearch } from "../context/SearchContext";
import { getDashboardStats, getRiskAssessments } from "../api/client";
import type { RiskAssessment } from "../api/types";
import { Avatar, Badge, cn, riskVariant } from "../ui";
import { shellTabsForRole } from "./shellTabs";
import { riskSummary } from "./RiskResult";

const POLL_MS = 60_000;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Closes a popover on outside pointer-down or Escape; Escape returns focus to the trigger. */
function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement>, trigger: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        trigger.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close, ref, trigger]);
}

function usePendingReviews() {
  const location = useLocation();
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<RiskAssessment[]>([]);
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Only one request is in flight; a forced refresh supersedes a running one (older results are dropped).
  const refresh = useCallback((force = false) => {
    if (inFlight.current && !force) return;
    const id = ++sequence.current;
    inFlight.current = true;
    Promise.all([
      getRiskAssessments({ reviewStatus: "pending", limit: 10 }),
      getDashboardStats().catch(() => null),
    ])
      .then(([list, stats]) => {
        if (!mounted.current || id !== sequence.current) return;
        setItems(list);
        setCount(stats ? stats.pendingReview : list.length);
      })
      .catch(() => {
        if (!mounted.current || id !== sequence.current) return;
        setItems([]);
        setCount(0);
      })
      .finally(() => {
        if (id === sequence.current) inFlight.current = false;
      });
  }, []);

  // Refresh on mount and on every route change (sign-offs happen on other pages).
  useEffect(() => {
    refresh(true);
  }, [refresh, location.pathname]);

  // Slow poll, paused while the tab is hidden; catches up when it becomes visible again.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { count, items, refresh };
}

function SearchPill() {
  const { query, setQuery } = useSearch();
  return (
    <label className="flex h-[42px] w-[210px] items-center gap-2 rounded-full bg-white px-4 shadow-[0_4px_14px_rgba(31,60,120,.06)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#1f5eff] max-[560px]:w-full max-[560px]:order-last">
      <Search className="h-4 w-4 shrink-0 text-[#5b6b85]" aria-hidden />
      <span className="sr-only">Search patients</span>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search patients"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] font-medium text-[#0b1530] outline-none placeholder:text-[#5b6b85]"
      />
    </label>
  );
}

function BellMenu() {
  const { count, items, refresh } = usePendingReviews();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref, trigger);

  return (
    <div ref={ref} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="true"
        aria-label={count > 0 ? `Notifications, ${count} pending review` : "Notifications, nothing pending"}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (!open) refresh(true);
          setOpen((value) => !value);
        }}
        className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full bg-white text-[#33405a] shadow-[0_4px_14px_rgba(31,60,120,.06)] hover:text-[#1f5eff]"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {count > 0 && (
          <span aria-hidden data-testid="bell-dot" className="absolute right-[11px] top-[10px] h-[7px] w-[7px] rounded-full bg-[#dc2626]" />
        )}
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-[50px] z-40 w-[340px] max-w-[calc(100vw-32px)] rounded-[18px] bg-white p-3 shadow-[0_40px_90px_-30px_rgba(11,21,48,.5)]"
        >
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <h2 className="text-[15px] font-bold text-[#0b1530]">Pending review</h2>
            <span className="text-xs font-semibold text-[#5b6b85]">{count} waiting</span>
          </div>
          {items.length === 0 ? (
            <p className="px-2 pb-3 pt-1 text-sm text-[#5b6b85]">Nothing is waiting for sign-off.</p>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto">
              {items.map((item) => (
                <li key={item.assessmentId}>
                  <Link
                    to={`/dashboard?assessment=${item.assessmentId}`}
                    onClick={() => {
                      close();
                      trigger.current?.focus();
                    }}
                    className="flex items-center justify-between gap-3 rounded-[12px] px-2 py-2.5 hover:bg-[#e8eefb]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#0b1530]">{item.patientName}</span>
                      <span className="block text-xs text-[#5b6b85]">
                        {formatDate(item.createdAt)} · {riskSummary(item)}
                      </span>
                    </span>
                    <Badge variant={riskVariant(item.effectiveRiskLevel)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AvatarMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref, trigger);

  if (!user) return null;
  const displayName = user.fullName || user.username;
  const expiry = formatDate(user.demoExpiresAt);

  return (
    <div ref={ref} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="true"
        aria-label={`Account menu for ${displayName}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full"
      >
        <Avatar name={displayName} />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-[50px] z-40 w-[260px] rounded-[18px] bg-white p-3 shadow-[0_40px_90px_-30px_rgba(11,21,48,.5)]"
        >
          <div className="px-2 pb-3 pt-1">
            <p className="truncate text-sm font-bold text-[#0b1530]">{user.username}</p>
            <p className="text-xs capitalize text-[#5b6b85]">{user.role}</p>
            {user.isDemo && (
              <p className="mt-2 inline-block rounded-full bg-[#e6edff] px-2.5 py-1 text-[11.5px] font-bold text-[#1446d1]">
                {expiry ? `Demo · expires ${expiry}` : "Demo account"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              close();
              trigger.current?.focus();
              logout();
            }}
            className="flex w-full items-center gap-2 rounded-[12px] px-2 py-2.5 text-sm font-semibold text-[#33405a] hover:bg-[#e8eefb]"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

function ShellFrame() {
  const { user } = useAuth();
  const tabs = shellTabsForRole(user?.role);

  return (
    <div className="min-h-screen bg-[#dfe7f3] p-[clamp(8px,1.5vw,20px)]">
      <div className="mx-auto max-w-[1440px] rounded-[28px] bg-[#f6f8fc] px-[clamp(16px,2vw,28px)] pb-7 pt-5 shadow-[0_30px_80px_-30px_rgba(31,60,120,.25)]">
        <header className="flex flex-wrap items-center gap-5">
          <Link to="/dashboard" className="flex items-center gap-2.5 rounded-lg">
            <img src="/cardiovascular.png" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="text-[19px] font-bold tracking-[-0.02em] text-[#0b1530]">CardioScreen</span>
          </Link>

          <nav
            aria-label="Main"
            className="inline-flex gap-1 overflow-x-auto rounded-full bg-white p-[5px] shadow-[0_4px_14px_rgba(31,60,120,.06)] max-[1180px]:order-last max-[1180px]:w-full"
          >
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex h-[38px] shrink-0 items-center rounded-full px-[18px] text-[13.5px] font-semibold transition-colors duration-[180ms]",
                    isActive ? "bg-[#1f5eff] text-white" : "text-[#33405a] hover:bg-[#e8eefb]"
                  )
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 max-[560px]:w-full max-[560px]:flex-wrap">
            <SearchPill />
            <BellMenu />
            <AvatarMenu />
          </div>
        </header>

        <main className="mt-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <SearchProvider>
      <ShellFrame />
    </SearchProvider>
  );
}
