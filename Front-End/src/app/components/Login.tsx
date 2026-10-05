import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Check, Copy, Lock, Mail, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/errors";
import { Button, Field, Input, PasswordInput, cn } from "../ui";
import { formatDate } from "./dashboard/logic";

interface DemoExpiredInfo {
  message: string;
  contactEmail?: string;
}

interface LoginLocationState {
  username?: string;
  password?: string;
  fromDemo?: boolean;
  expiresAt?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ErrorView =
  | { kind: "expired"; info: DemoExpiredInfo }
  | { kind: "locked" | "generic"; message: string };

export function describeLoginError(error: unknown): ErrorView {
  if (error instanceof ApiError) {
    if (error.isDemoExpired) {
      return { kind: "expired", info: { message: error.message, contactEmail: error.contactEmail } };
    }
    if (error.status === 429) {
      return {
        kind: "locked",
        message: error.message || "Too many failed attempts. Please wait a few minutes and try again.",
      };
    }
    if (error.status === 401) {
      return { kind: "generic", message: "Incorrect username or password." };
    }
    return { kind: "generic", message: error.message || "Login failed. Please try again." };
  }
  if (error instanceof TypeError) {
    return { kind: "generic", message: "Could not reach the server. Check your connection and try again." };
  }
  return { kind: "generic", message: "Login failed. Please try again." };
}

function CopyButton({ value, label, onFailure }: { value: string; label: string; onFailure: () => void }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      onClick={() => {
        const write = navigator.clipboard?.writeText(value);
        if (!write) {
          onFailure();
          return;
        }
        write
          .then(() => {
            setCopied(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1800);
          })
          .catch(onFailure);
      }}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d6deec] bg-white text-[#33405a] hover:border-[#1f5eff] hover:text-[#1f5eff]"
    >
      {copied ? <Check className="h-4 w-4 text-[#16a34a]" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  );
}

function DemoCredentials({ username, password, expiresAt }: { username: string; password: string; expiresAt?: string }) {
  const until = formatDate(expiresAt);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <div role="status" className="mb-6 rounded-[16px] border border-[#cfdcff] bg-[#eef3fd] p-4">
      <p className="text-[13.5px] font-semibold leading-snug text-[#0b1530]">
        Your demo account is ready — save these credentials to come back {until ? `(valid until ${until})` : "(valid for a limited time)"}
      </p>
      <dl className="mt-3 space-y-2 text-[13px]">
        {[
          { label: "Username", value: username },
          { label: "Password", value: password },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <dt className="w-[72px] shrink-0 text-[#5b6b85]">{row.label}</dt>
            <dd className="min-w-0 flex-1 truncate rounded-[10px] bg-white px-3 py-1.5 font-mono text-[13px] text-[#0b1530]">
              {row.value}
            </dd>
            <CopyButton value={row.value} label={row.label.toLowerCase()} onFailure={() => setCopyFailed(true)} />
          </div>
        ))}
      </dl>
      {copyFailed && (
        <p role="alert" className="mt-2 text-[12.5px] font-medium text-[#b91c1c]">
          Copy failed — select and copy manually
        </p>
      )}
    </div>
  );
}

function ExpiredPanel({ info }: { info: DemoExpiredInfo }) {
  const email = info.contactEmail && EMAIL_RE.test(info.contactEmail) ? info.contactEmail : undefined;
  return (
    <div role="alert" className="mb-6 rounded-[16px] border border-[#fde68a] bg-[#fffbeb] p-4">
      <p className="text-[14px] font-bold text-[#92400e]">Demo ended</p>
      <p className="mt-1 text-[13.5px] leading-snug text-[#78350f]">{info.message}</p>
      {email && (
        <p className="mt-2 flex items-center gap-2 text-[13.5px] text-[#78350f]">
          <Mail className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            For more access, contact{" "}
            <a
              href={`mailto:${email}?subject=${encodeURIComponent("CardioScreen access")}`}
              className="font-semibold text-[#1f5eff] hover:text-[#1446d1]"
            >
              {email}
            </a>
            .
          </span>
        </p>
      )}
    </div>
  );
}

export function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, sessionEnded, clearSessionEnded } = useAuth();

  // Captured once so the notice survives clearing the (password-bearing) navigation state below.
  const [initial] = useState<LoginLocationState>(() => (location.state as LoginLocationState | null) ?? {});
  const [username, setUsername] = useState(initial.username ?? "");
  const [password, setPassword] = useState(initial.password ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorView | null>(() =>
    sessionEnded?.code === "demo_expired"
      ? { kind: "expired", info: { message: sessionEnded.message, contactEmail: sessionEnded.contactEmail } }
      : null
  );
  const showDemoNotice = Boolean(initial.fromDemo && initial.username && initial.password);

  const cleanedUp = useRef(false);
  useEffect(() => {
    if (cleanedUp.current) return;
    cleanedUp.current = true;
    // The session-end message is shown once.
    if (sessionEnded) clearSessionEnded();
    // Do not leave the demo password in browser history state.
    if (initial.password) {
      navigate(location.pathname, { replace: true, state: { from: (location.state as { from?: string } | null)?.from } });
    }
  }, [sessionEnded, clearSessionEnded, initial.password, location.pathname, location.state, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(describeLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#dfe7f3] p-[clamp(8px,1.5vw,20px)]">
      <main className="w-full max-w-[440px] rounded-[28px] bg-white p-[clamp(24px,4vw,36px)] shadow-[0_30px_80px_-30px_rgba(31,60,120,.25)]">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5 rounded-lg">
          <img src="/cardiovascular.png" alt="" width={34} height={34} className="h-[34px] w-[34px]" />
          <span className="text-xl font-bold tracking-[-0.02em] text-[#0b1530]">CardioScreen</span>
        </Link>

        <h1 className="text-center text-[28px] font-bold leading-tight tracking-[-0.03em] text-[#0b1530]">Welcome back</h1>
        <p className="mb-6 mt-2 text-center text-[14px] text-[#5b6b85]">Sign in to continue to your workspace.</p>

        {showDemoNotice && <DemoCredentials username={initial.username!} password={initial.password!} expiresAt={initial.expiresAt} />}
        {error?.kind === "expired" && <ExpiredPanel info={error.info} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Username">
            {(control) => (
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8fa1c4]" aria-hidden />
                <Input
                  {...control}
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="pl-10"
                  placeholder="Enter username"
                  required
                />
              </div>
            )}
          </Field>
          <Field label="Password">
            {(control) => (
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#8fa1c4]" aria-hidden />
                <PasswordInput
                  {...control}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="pl-10"
                  placeholder="Enter password"
                  required
                />
              </div>
            )}
          </Field>

          {error && error.kind !== "expired" && (
            <p
              role="alert"
              className={cn(
                "rounded-[12px] px-3.5 py-2.5 text-[13.5px] font-medium",
                error.kind === "locked" ? "bg-[#fef3c7] text-[#92400e]" : "bg-[#fee2e2] text-[#b91c1c]"
              )}
            >
              {error.message}
            </p>
          )}

          <Button type="submit" size="lg" disabled={loading} className="h-[50px] w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-[#5b6b85]">
          <Link to="/" className="font-semibold text-[#1f5eff] hover:text-[#1446d1]">
            Back to home
          </Link>
        </p>
      </main>
    </div>
  );
}
