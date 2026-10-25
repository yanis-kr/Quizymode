import { useQuery } from "@tanstack/react-query";
import { taxonomyApi } from "@/api/taxonomy";
import { useAuth } from "@/contexts/AuthContext";
import { TAXONOMY_QUERY_ROOT } from "./topicQueryKeys";

const TAXONOMY_STALE_MS = 24 * 60 * 60 * 1000;

/** Keyed by user so a cached taxonomy never crosses accounts; purged on sign-out with the suggestions. */
export function taxonomyQueryKey(userId: string | null | undefined): readonly [string, string] {
  return [TAXONOMY_QUERY_ROOT, userId ?? "anon"];
}

/** GET /taxonomy through one shared cache entry per user. */
export function useTaxonomy(enabled = true) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: taxonomyQueryKey(userId),
    queryFn: () => taxonomyApi.getAll(),
    staleTime: TAXONOMY_STALE_MS,
    enabled,
  });
}
