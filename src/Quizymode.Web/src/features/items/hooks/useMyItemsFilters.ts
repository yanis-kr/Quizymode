import { useState, useEffect, useCallback } from "react";
import type {
  MyItemsFilters,
  FilterType,
  ItemTypeFilter,
  RatingFilterValue,
} from "../types/filters";

const initialFilters: MyItemsFilters = {
  filterType: "all",
  selectedCategory: "",
  searchText: "",
  selectedKeywords: [],
  ratingFilter: "all",
};

export const useMyItemsFilters = () => {
  const [filters, setFilters] = useState<MyItemsFilters>(initialFilters);
  const [activeFilters, setActiveFilters] = useState<Set<FilterType>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters =
    filters.filterType !== "all" ||
    filters.selectedCategory !== "" ||
    filters.selectedKeywords.length > 0 ||
    filters.searchText !== "" ||
    filters.ratingFilter !== "all";

  const clearAllFilters = useCallback(() => {
    setFilters(initialFilters);
    setActiveFilters(new Set());
    setShowFilters(false);
  }, []);

  const addFilter = useCallback((filterTypeName: FilterType) => {
    if (filterTypeName === "itemType") {
      // Item Type is always visible, but we can mark it as active in filters
      setActiveFilters((prev) => new Set(prev).add("itemType"));
    } else {
      setActiveFilters((prev) => new Set(prev).add(filterTypeName));
      setShowFilters(true);
    }
  }, []);

  const removeFilter = useCallback((filterTypeName: FilterType) => {
    if (filterTypeName === "itemType") {
      setFilters((prev) => ({ ...prev, filterType: "all" }));
      setActiveFilters((prev) => {
        const newSet = new Set(prev);
        newSet.delete("itemType");
        return newSet;
      });
    } else {
      setActiveFilters((prev) => {
        const newSet = new Set(prev);
        newSet.delete(filterTypeName);
        return newSet;
      });

      if (filterTypeName === "category") {
        setFilters((prev) => ({ ...prev, selectedCategory: "" }));
      } else if (filterTypeName === "keywords") {
        setFilters((prev) => ({ ...prev, selectedKeywords: [] }));
      } else if (filterTypeName === "search") {
        setFilters((prev) => ({ ...prev, searchText: "" }));
      } else if (filterTypeName === "rating") {
        setFilters((prev) => ({ ...prev, ratingFilter: "all" }));
      }
    }
  }, []);

  const updateFilter = useCallback(<K extends keyof MyItemsFilters>(
    key: K,
    value: MyItemsFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const removeKeyword = useCallback((keywordName: string) => {
    setFilters((prev) => {
      const newKeywords = prev.selectedKeywords.filter((k) => k !== keywordName);
      // If no keywords left, remove keywords filter
      if (newKeywords.length === 0) {
        setActiveFilters((prev) => {
          const newSet = new Set(prev);
          newSet.delete("keywords");
          return newSet;
        });
      }
      return { ...prev, selectedKeywords: newKeywords };
    });
  }, []);

  // Track itemType in activeFilters
  useEffect(() => {
    if (filters.filterType !== "all") {
      setActiveFilters((prev) => new Set(prev).add("itemType"));
    } else {
      setActiveFilters((prev) => {
        const newSet = new Set(prev);
        newSet.delete("itemType");
        return newSet;
      });
    }
  }, [filters.filterType]);

  // Auto-show filters if any are active
  useEffect(() => {
    if (hasActiveFilters && !showFilters) {
      setShowFilters(true);
    }
  }, [hasActiveFilters, showFilters]);

  return {
    filters,
    activeFilters,
    showFilters,
    hasActiveFilters,
    setShowFilters,
    clearAllFilters,
    addFilter,
    removeFilter,
    updateFilter,
    removeKeyword,
  };
};
