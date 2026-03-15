export type ItemTypeFilter = "all" | "public" | "private";

export type FilterType = "category" | "keywords" | "search" | "itemType" | "rating";

/** Min/max star rating (1-5). null = no bound. includeUnrated = also show items with no rating. onlyUnrated = show only items with no rating. */
export interface RatingRangeFilter {
  min: number | null;
  max: number | null;
  includeUnrated?: boolean;
  onlyUnrated?: boolean;
}

export interface MyItemsFilters {
  filterType: ItemTypeFilter;
  selectedCategory: string;
  searchText: string;
  selectedKeywords: string[];
  /** Rating range: items with average rating between min and max (inclusive). null = any. */
  ratingMin: number | null;
  ratingMax: number | null;
  /** When true, also include items that have no rating (only applies when range is set). */
  ratingIncludeUnrated: boolean;
  /** When true, show only items that have no rating (overrides range). */
  ratingOnlyUnrated: boolean;
}

export interface FilterState {
  filters: MyItemsFilters;
  activeFilters: Set<FilterType>;
  showFilters: boolean;
}
