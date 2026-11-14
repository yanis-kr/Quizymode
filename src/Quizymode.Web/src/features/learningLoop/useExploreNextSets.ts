import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { featuredApi, type FeaturedSetDto } from "@/api/featured";
import { interestsApi } from "@/api/learningLoop";
import { studySessionsApi } from "@/api/studySessions";
import { readGuestHistory, readGuestRunSummary } from "@/features/guestHistory/guestHistoryStorage";
import { buildGuestPracticePath } from "@/features/guestHistory/guestHistoryLinks";
import { homeCategoryCards } from "@/features/home/homePageData";
import { CATEGORY_FALLBACK_ID_PREFIX, rankPersonalizedHome, type ActivityRun } from "@/features/home/personalization";
import { useInterests, useLocalVersion } from "@/features/interests/useInterests";
import { topicParts } from "@/features/interests/topicPaths";
import type { ExploreNextTile } from "@/components/study/ExploreNextTiles";

const categoryNames = new Map(homeCategoryCards.map((card) => [card.slug, card.name]));
const knownCategories = homeCategoryCards.map((card) => card.slug);

/** Quiz link for a recommended set: the same scope as the set, five questions. */
export function exploreNextPath(set: FeaturedSetDto): string {
  const path = buildGuestPracticePath({
    kind: "category",
    categorySlug: set.categorySlug,
    navigationKeywords: [set.navKeyword1, set.navKeyword2].filter((keyword): keyword is string => Boolean(keyword)),
    filterKeywords: [],
  });
  return `${path}${path.includes("?") ? "&" : "?"}size=5`;
}

/**
 * A featured set has a real item count: the tile says how many questions it will play (at most 5) and offers "Play 5" only
 * when it has five. A category-level fallback card has no known count, so it shows no count line and "Play quiz".
 */
function toTile(set: FeaturedSetDto): ExploreNextTile {
  const isFallback = set.id.startsWith(CATEGORY_FALLBACK_ID_PREFIX);
  const playable = Math.min(set.itemCount, 5);
  return {
    id: set.id,
    label: set.displayName,
    ...(isFallback ? {} : { copy: `${playable} ${playable === 1 ? "question" : "questions"}` }),
    cta: !isFallback && playable === 5 ? "Play 5" : "Play quiz",
    to: exploreNextPath(set),
  };
}

/**
 * Up to `limit` quiz tiles for the end of a Daily run (#649): the visitor's saved topics first, otherwise what they have
 * played, otherwise the featured catalog. Reuses `rankPersonalizedHome` and the Home query keys, so the data is usually
 * already cached. Any failure yields no tiles (never an error) so the result screen is unaffected.
 */
export function useExploreNextSets(limit = 3): { tiles: ExploreNextTile[]; isLoading: boolean } {
  const { isAuthenticated, isLoading: isAuthLoading, userId } = useAuth();
  const signedIn = isAuthenticated && !isAuthLoading;
  const localVersion = useLocalVersion();
  const { interests, status: interestsStatus } = useInterests();

  const featuredQuery = useQuery({
    queryKey: ["home", "featured"],
    queryFn: () => featuredApi.get(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const popularQuery = useQuery({
    queryKey: ["home", "popular-categories"],
    queryFn: () => interestsApi.popularCategories(),
    enabled: !isAuthLoading,
    retry: false,
    staleTime: 30 * 60 * 1000,
  });
  const sessionsQuery = useQuery({
    queryKey: ["home", "sessions", userId],
    queryFn: () => studySessionsApi.list(20),
    enabled: signedIn,
    retry: false,
  });

  const runs = useMemo<ActivityRun[]>(() => {
    if (signedIn) {
      return (sessionsQuery.data ?? [])
        .map((session) => readGuestRunSummary(session))
        .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
        .map((summary) => ({ completedAt: summary.completedAt, source: summary.source, mode: summary.mode }));
    }
    return isAuthLoading ? [] : readGuestHistory().map((summary) => ({ completedAt: summary.completedAt, source: summary.source, mode: summary.mode }));
    // localVersion re-reads this browser's history after a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, isAuthLoading, sessionsQuery.data, localVersion]);

  // A set with no questions would land on "No items found", so it is never offered.
  const featuredSets = useMemo(() => featuredQuery.data?.sets.filter((set) => set.itemCount > 0), [featuredQuery.data]);
  const tiles = useMemo(() => {
    if (!featuredSets) return [];
    const ranked = rankPersonalizedHome({
      explicitInterests: interests,
      runs,
      featuredSets,
      popularCategories: popularQuery.data ?? [],
      knownCategories: [...knownCategories, ...interests.map((path) => topicParts(path).category)],
      categoryNames,
      focused: interests.length > 0,
    });
    return ranked.recommended.slice(0, limit).map(toTile);
  }, [featuredSets, interests, runs, popularQuery.data, limit]);

  const isLoading =
    isAuthLoading ||
    featuredQuery.isLoading ||
    (signedIn && sessionsQuery.isLoading) ||
    (signedIn && interestsStatus === "loading");
  return { tiles, isLoading };
}
