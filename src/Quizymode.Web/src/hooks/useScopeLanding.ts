import { useQuery } from "@tanstack/react-query";
import { featuredApi } from "@/api/featured";
import { gamesApi } from "@/api/games";
import { itemsApi } from "@/api/items";
import { GAME_MIN_ITEMS } from "@/features/games/gameRoster";
import { categoryDisplayName, keywordDisplayName } from "@/utils/categorySlug";
import { promotedScopeDescription } from "@/utils/promotedScopes";

export type LandingLoadState = "loading" | "ready" | "error";
export type LandingGamesState = "loading" | "available" | "unavailable";

export interface ScopeLandingInput {
  categoryName: string | null;
  categorySlug: string | undefined;
  /** Navigation (path) keywords: 0 to 2. */
  nav: string[];
  /** Names and descriptions of the path keywords, in path order, when loaded. */
  keywordDescriptions?: { name: string; description: string | null }[];
  categoryDescription?: string | null;
  /** False on the /categories index and the "all" scope: nothing is fetched there. */
  enabled: boolean;
}

export interface ScopeLanding {
  title: string;
  description: string | null;
  /** Unfiltered number of questions in the scope. */
  count: number | undefined;
  countState: LandingLoadState;
  games: LandingGamesState;
}

const sameText = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * Data for the set landing header (#646). The count is the UNFILTERED scope count: a dedicated page-size-1 request
 * for the category plus path keywords, so it is independent of the search and rating filters and of the Sets/List
 * view (the List query only runs in the List view and follows the filters). Cached by scope.
 */
export function useScopeLanding(input: ScopeLandingInput): ScopeLanding {
  const { categoryName, categorySlug, nav, keywordDescriptions, categoryDescription, enabled } = input;
  const active = enabled && !!categoryName;

  // Same key and options as the Home page, so the catalog is usually already cached.
  const featuredQuery = useQuery({
    queryKey: ["home", "featured"],
    queryFn: () => featuredApi.get(),
    enabled: active,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const countQuery = useQuery({
    queryKey: ["scopeCount", categoryName, nav],
    queryFn: async () => {
      const response = await itemsApi.getAll(
        categoryName ?? undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        1,
        { navigationKeywords: nav.length > 0 ? nav : undefined }
      );
      return response.totalCount;
    },
    enabled: active,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const rosterToken = categoryName ? [categoryName, ...nav].join("/") : "";
  // "/" separates the segments on the wire; such a scope cannot be probed, so the Games hub decides.
  const rosterProbeable = [categoryName, ...nav].every((s) => !!s && !s.includes("/"));
  const rosterQuery = useQuery({
    queryKey: ["gameRoster", "landing", rosterToken],
    queryFn: () => gamesApi.getRoster([rosterToken], GAME_MIN_ITEMS),
    enabled: active && rosterProbeable,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const featuredSet = featuredQuery.data?.sets.find(
    (s) =>
      sameText(s.categorySlug, categorySlug) &&
      sameText(s.navKeyword1, nav[0]) &&
      sameText(s.navKeyword2, nav[1])
  );

  const deepest = keywordDescriptions && nav.length > 0 ? keywordDescriptions[nav.length - 1] : undefined;
  const deepestName = deepest?.name || nav[nav.length - 1];
  const title =
    featuredSet?.displayName ??
    (nav.length > 0 && deepestName
      ? keywordDisplayName(deepestName)
      : categoryDisplayName(categoryName ?? categorySlug ?? ""));

  const keywordDescription = deepest?.description?.trim() || null;
  // Promoted scopes get a hand-written one-sentence description first (#714); the taxonomy text is the fallback.
  const promoted = categorySlug ? promotedScopeDescription([categorySlug, ...nav].join("/")) : null;
  const description = promoted ?? keywordDescription ?? (nav.length === 0 ? categoryDescription?.trim() || null : null);

  const countState: LandingLoadState = countQuery.isError ? "error" : countQuery.isSuccess ? "ready" : "loading";

  let games: LandingGamesState;
  if (!rosterProbeable) games = "available";
  else if (rosterQuery.isError) games = "unavailable";
  else if (rosterQuery.isSuccess) games = rosterQuery.data.items.length >= GAME_MIN_ITEMS ? "available" : "unavailable";
  else games = "loading";

  return { title, description, count: countQuery.data, countState, games };
}
