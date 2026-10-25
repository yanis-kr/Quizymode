import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { searchApi, type SearchResponse, type SearchType } from "@/api/search";
import { MIN_QUERY_LENGTH } from "./searchParams";

export const SEARCH_DEBOUNCE_MS = 200;

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface UseGlobalSearchOptions {
  /** The text as typed (leading whitespace stripped, trailing kept: it tells the API the last word is finished). */
  q: string;
  types: SearchType[];
  limit: number;
  offset: number;
  /** Which kind of visitor is asking; results differ (`mine`), so the cache is split. */
  signedIn: boolean;
  /** Set false on the /search page, where the URL already is a committed search. */
  debounce?: boolean;
}

export interface GlobalSearchResult {
  query: UseQueryResult<SearchResponse>;
  /** True when `query.data` answers exactly the text currently typed (not a placeholder, not still debouncing). */
  isFresh: boolean;
  /** True while the typed text is long enough to search. */
  isSearchable: boolean;
}

/**
 * Debounced global search. The previous result stays visible while the next one loads, a superseded request is
 * cancelled through the query signal, and a failure is never retried automatically.
 */
export function useGlobalSearch({
  q,
  types,
  limit,
  offset,
  signedIn,
  debounce = true,
}: UseGlobalSearchOptions): GlobalSearchResult {
  const debouncedQ = useDebouncedValue(q, SEARCH_DEBOUNCE_MS);
  const effectiveQ = debounce ? debouncedQ : q;
  const typesKey = types.join(",");
  const enabled = effectiveQ.trim().length >= MIN_QUERY_LENGTH;

  const query = useQuery({
    queryKey: ["search", effectiveQ, typesKey, limit, offset, signedIn],
    queryFn: ({ signal }) => searchApi.search({ q: effectiveQ, types, limit, offset }, signal),
    enabled,
    retry: false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  return {
    query,
    isFresh: enabled && effectiveQ === q && query.isSuccess && !query.isPlaceholderData,
    isSearchable: q.trim().length >= MIN_QUERY_LENGTH,
  };
}
