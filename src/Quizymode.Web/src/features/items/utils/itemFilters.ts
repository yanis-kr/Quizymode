import type { ItemResponse } from "@/types/api";
import type { RatingRangeFilter } from "../types/filters";

interface FilterItemsParams {
  items: ItemResponse[];
  searchText: string;
  ratingRange: RatingRangeFilter;
  ratingsMap: Map<string, number | null>;
  ratingsLoaded: boolean;
}

/**
 * Filters items based on search text and rating (range or only unrated).
 */
export const filterItems = ({
  items,
  searchText,
  ratingRange,
  ratingsMap,
  ratingsLoaded,
}: FilterItemsParams): ItemResponse[] => {
  const onlyUnrated = ratingRange.onlyUnrated === true;
  const hasRange = ratingRange.min !== null || ratingRange.max !== null;
  const hasRatingFilter = onlyUnrated || hasRange;

  return items.filter((item) => {
    // Search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      const matchesSearch =
        item.question.toLowerCase().includes(searchLower) ||
        item.correctAnswer.toLowerCase().includes(searchLower) ||
        item.explanation?.toLowerCase().includes(searchLower) ||
        item.category.toLowerCase().includes(searchLower) ||
        item.keywords?.some((k) =>
          k.name.toLowerCase().includes(searchLower)
        ) ||
        false;
      if (!matchesSearch) return false;
    }

    // Rating filter
    if (hasRatingFilter && ratingsLoaded) {
      const averageStars = ratingsMap.get(item.id);
      const itemInMap = ratingsMap.has(item.id);
      const rating =
        itemInMap &&
        averageStars !== null &&
        averageStars !== undefined &&
        typeof averageStars === "number" &&
        !isNaN(averageStars) &&
        averageStars > 0
          ? averageStars
          : null;

      if (onlyUnrated) {
        return rating === null;
      }

      if (rating === null) {
        return ratingRange.includeUnrated === true;
      }

      const min = ratingRange.min ?? 1;
      const max = ratingRange.max ?? 5;
      return rating >= min && rating <= max;
    }

    return true;
  });
};
