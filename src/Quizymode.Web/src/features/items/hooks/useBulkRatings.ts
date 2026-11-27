import { useQuery, type QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ratingsApi } from "@/api/ratings";

type RatingsMap = Map<string, number | null>;

const BULK_RATINGS_KEY = ["ratingStats", "bulk"] as const;
const BULK_RATINGS_STALE_MS = 5 * 60 * 1000;

const isRateLimited = (error: unknown): boolean =>
  isAxiosError(error) && error.response?.status === 429;

/**
 * After one item is rated, refreshes only that item inside the loaded bulk maps (#904).
 * Reloading the maps would send one request per listed item.
 */
export const patchBulkRating = async (queryClient: QueryClient, itemId: string) => {
  const holding = queryClient
    .getQueriesData<RatingsMap>({ queryKey: BULK_RATINGS_KEY })
    .filter(([, map]) => map?.has(itemId));
  if (holding.length === 0) return;

  try {
    const stats = await queryClient.fetchQuery({
      queryKey: ["ratingStats", itemId],
      queryFn: () => ratingsApi.getStats(itemId),
      staleTime: 0,
    });
    for (const [key] of holding) {
      const map = queryClient.getQueryData<RatingsMap>(key);
      if (!map) continue;
      queryClient.setQueryData<RatingsMap>(
        key,
        new Map(map).set(itemId, stats.averageStars ?? null),
        // The other entries are no fresher than before.
        { updatedAt: queryClient.getQueryState(key)?.dataUpdatedAt }
      );
    }
  } catch {
    // Keep the old values and reload them the next time a list needs them.
    await queryClient.invalidateQueries({ queryKey: BULK_RATINGS_KEY, refetchType: "none" });
  }
};

/**
 * Custom hook to fetch ratings for multiple items in bulk
 * @param itemIds Array of item IDs to fetch ratings for
 * @returns Map of itemId -> averageStars (number | null). A rate limit (429) is an error, not a missing rating.
 */
export const useBulkRatings = (itemIds: string[]) => {
  const itemIdsKey = itemIds.sort().join(","); // Stable key for query

  const ratingStatsResults = useQuery({
    queryKey: [...BULK_RATINGS_KEY, itemIdsKey],
    queryFn: async () => {
      const results = await Promise.allSettled(
        itemIds.map((itemId) => ratingsApi.getStats(itemId))
      );
      const map: RatingsMap = new Map();
      itemIds.forEach((itemId, index) => {
        const result = results[index];
        if (result.status === "fulfilled") {
          const ratingStats = result.value;
          const averageStars = ratingStats?.averageStars ?? null;
          map.set(itemId, averageStars);
        } else if (isRateLimited(result.reason)) {
          throw result.reason;
        } else {
          // If API call failed, treat as no rating
          map.set(itemId, null);
        }
      });
      return map;
    },
    enabled: itemIds.length > 0,
    staleTime: BULK_RATINGS_STALE_MS,
    refetchOnWindowFocus: false,
  });

  return {
    ratingsMap: ratingStatsResults.data || new Map<string, number | null>(),
    isLoading: ratingStatsResults.isLoading,
    isSuccess: ratingStatsResults.isSuccess,
    isError: ratingStatsResults.isError,
    error: ratingStatsResults.error,
    refetch: ratingStatsResults.refetch,
  };
};
