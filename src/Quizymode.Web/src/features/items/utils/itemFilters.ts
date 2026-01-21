import type { ItemResponse } from "@/types/api";
import type { RatingFilterValue } from "../types/filters";

interface FilterItemsParams {
  items: ItemResponse[];
  searchText: string;
  ratingFilter: RatingFilterValue;
  ratingsMap: Map<string, number | null>;
  ratingsLoaded: boolean;
}

/**
 * Filters items based on search text and rating filter
 */
export const filterItems = ({
  items,
  searchText,
  ratingFilter,
  ratingsMap,
  ratingsLoaded,
}: FilterItemsParams): ItemResponse[] => {
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

    // Rating filter - only apply if ratings query has succeeded
    if (ratingFilter !== "all" && ratingsLoaded) {
      const averageStars = ratingsMap.get(item.id);
      const itemInMap = ratingsMap.has(item.id);

      if (!itemInMap) {
        // Item not in ratings map yet
        if (ratingFilter === "none") {
          // Include items with no rating data
          return true;
        } else {
          // For rating filters (1+, 2+, etc.), exclude items not in map
          return false;
        }
      }

      // Item is in map - check its rating value
      const hasValidRating =
        averageStars !== null &&
        averageStars !== undefined &&
        typeof averageStars === "number" &&
        !isNaN(averageStars) &&
        averageStars > 0;

      if (ratingFilter === "none") {
        // Show only items with no rating
        return !hasValidRating;
      } else {
        // For rating filters (1+, 2+, etc.), only show items with valid ratings
        if (!hasValidRating) {
          return false;
        }

        // Now check the rating threshold
        const rating = averageStars as number;
        if (ratingFilter === "1+") {
          return rating >= 1;
        } else if (ratingFilter === "2+") {
          return rating >= 2;
        } else if (ratingFilter === "3+") {
          return rating >= 3;
        } else if (ratingFilter === "4+") {
          return rating >= 4;
        } else if (ratingFilter === "5") {
          // For exactly 5 stars, check if it's >= 4.5 (to account for rounding)
          return rating >= 4.5;
        }
        return true;
      }
    }

    return true;
  });
};
