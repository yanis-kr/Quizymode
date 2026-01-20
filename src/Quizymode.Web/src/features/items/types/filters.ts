export type ItemTypeFilter = "all" | "public" | "private";

export type FilterType = "category" | "keywords" | "search" | "itemType" | "rating";

export type RatingFilterValue = "all" | "none" | "1+" | "2+" | "3+" | "4+" | "5";

export interface MyItemsFilters {
  filterType: ItemTypeFilter;
  selectedCategory: string;
  searchText: string;
  selectedKeywords: string[];
  ratingFilter: RatingFilterValue;
}

export interface FilterState {
  filters: MyItemsFilters;
  activeFilters: Set<FilterType>;
  showFilters: boolean;
}
