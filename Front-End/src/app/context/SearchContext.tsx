import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface SearchContextValue {
  query: string;
  setQuery: (query: string) => void;
}

const SearchContext = createContext<SearchContextValue>({ query: "", setQuery: () => undefined });

/** Holds the top-nav search text so pages (dashboard, patients) can filter by it. */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  return useContext(SearchContext);
}
