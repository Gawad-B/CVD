import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ApiError, startDemo } from "../api/client";
import { useAuth } from "../context/AuthContext";

type DemoState = {
  authenticated: boolean;
  pending: boolean;
  error: string | null;
  start: () => void;
  dismissError: () => void;
};

const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    if (pending) return;
    setPending(true);
    startDemo()
      .then((account) => {
        navigate("/login", {
          state: { username: account.username, password: account.password, fromDemo: true, expiresAt: account.expiresAt },
        });
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError && err.message
            ? err.message
            : "We could not create a demo right now. Please try again in a moment."
        );
      })
      .finally(() => setPending(false));
  }, [pending, navigate]);

  return (
    <DemoContext.Provider
      value={{ authenticated: isAuthenticated, pending, error, start, dismissError: () => setError(null) }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo(): DemoState {
  const value = useContext(DemoContext);
  if (!value) throw new Error("useDemo must be used inside DemoProvider");
  return value;
}
