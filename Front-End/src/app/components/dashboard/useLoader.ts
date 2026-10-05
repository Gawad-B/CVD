import { useCallback, useEffect, useRef, useState } from "react";

export interface LoaderState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  /** Refetch keeping the current data on screen (no skeleton flash). */
  reload: () => void;
}

/** Loads async data; resets when `key` changes, keeps stale data while `reload()` refetches. */
export function useLoader<T>(fetcher: () => Promise<T>, key: unknown, enabled = true): LoaderState<T> {
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>({
    data: null,
    error: null,
    loading: enabled,
  });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const lastKey = useRef(key);

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    const keyChanged = lastKey.current !== key;
    lastKey.current = key;
    setState((s) => ({ data: keyChanged ? null : s.data, error: null, loading: keyChanged || s.data === null }));
    fetcherRef.current().then(
      (data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState((s) => ({ data: s.data, error: error instanceof Error ? error : new Error(String(error)), loading: false }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, nonce, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
