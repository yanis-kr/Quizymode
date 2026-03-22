import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { keywordsApi } from "@/api/keywords";

const staleMs = 30 * 60 * 1000;
const gcMs = 60 * 60 * 1000;

/**
 * Merges taxonomy slugs with item tag names from the API for one category.
 * React Query keeps the API result in memory per category (staleTime/gcTime).
 */
export function useExtraKeywordAutocompleteSource(
  category: string,
  taxonomySlugs: string[],
  queryEnabled: boolean
) {
  const { data, isLoading } = useQuery({
    queryKey: ["itemTagKeywords", category],
    queryFn: () => keywordsApi.getItemTagKeywords(category),
    enabled: queryEnabled && !!category.trim(),
    staleTime: staleMs,
    gcTime: gcMs,
  });

  const extraKeywordAutocompleteSource = useMemo(() => {
    const fromDb = data?.names ?? [];
    const set = new Set<string>();
    for (const s of fromDb) {
      const n = s.trim().toLowerCase();
      if (n) set.add(n);
    }
    for (const s of taxonomySlugs) {
      const n = s.trim().toLowerCase();
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data?.names, taxonomySlugs]);

  return { extraKeywordAutocompleteSource, itemTagKeywordsLoading: isLoading };
}
