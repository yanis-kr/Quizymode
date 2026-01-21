import { useQuery } from "@tanstack/react-query";
import { ratingsApi } from "@/api/ratings";

/**
 * Custom hook to fetch ratings for multiple items in bulk
 * @param itemIds Array of item IDs to fetch ratings for
 * @returns Map of itemId -> averageStars (number | null)
 */
export const useBulkRatings = (itemIds: string[]) => {
  const itemIdsKey = itemIds.sort().join(","); // Stable key for query

  const ratingStatsResults = useQuery({
    queryKey: ["ratingStats", "bulk", itemIdsKey],
    queryFn: async () => {
      const results = await Promise.allSettled(
        itemIds.map((itemId) => ratingsApi.getStats(itemId))
      );
      const map = new Map<string, number | null>();
      itemIds.forEach((itemId, index) => {
        const result = results[index];
        if (result.status === "fulfilled") {
          const ratingStats = result.value;
          const averageStars = ratingStats?.averageStars ?? null;
          map.set(itemId, averageStars);
        } else {
          // If API call failed, treat as no rating
          map.set(itemId, null);
        }
      });
      return map;
    },
    enabled: itemIds.length > 0,
    staleTime: 0, // Don't cache - always refetch to get latest ratings
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return {
    ratingsMap: ratingStatsResults.data || new Map<string, number | null>(),
    isLoading: ratingStatsResults.isLoading,
    isSuccess: ratingStatsResults.isSuccess,
    isError: ratingStatsResults.isError,
  };
};
