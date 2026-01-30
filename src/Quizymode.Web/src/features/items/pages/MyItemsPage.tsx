import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { useState, useEffect, useMemo } from "react";
import { categoriesApi } from "@/api/categories";
import ItemCollectionsModal from "@/components/ItemCollectionsModal";
import ItemListSection from "@/components/ItemListSection";
import BulkItemCollectionsModal from "@/components/BulkItemCollectionsModal";
import useItemSelection from "@/hooks/useItemSelection";
import { usePageSize } from "@/hooks/usePageSize";
import { useMyItemsFilters } from "../hooks/useMyItemsFilters";
import { useBulkRatings } from "../hooks/useBulkRatings";
import { filterItems } from "../utils/itemFilters";
import { FilterSection } from "../components/filters/FilterSection";
import { AddFiltersSection } from "../components/filters/AddFiltersSection";
import { ItemTypeFilter } from "../components/filters/ItemTypeFilter";
import { CategoryFilter } from "../components/filters/CategoryFilter";
import { KeywordsFilter } from "../components/filters/KeywordsFilter";
import { SearchFilter } from "../components/filters/SearchFilter";
import { RatingFilter } from "../components/filters/RatingFilter";
import { MyItemsActions } from "../components/MyItemsActions";
import type { FilterType } from "../types/filters";

const MyItemsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Read URL parameters for restoring state
  const pageFromUrl = parseInt(searchParams.get("page") || "1", 10);
  const filterTypeFromUrl = (searchParams.get("filterType") || "all") as "all" | "public" | "private";
  const categoryFromUrl = searchParams.get("category") || "";
  const searchFromUrl = searchParams.get("search") || "";
  const keywordsFromUrl = searchParams.get("keywords")?.split(",").filter(Boolean) || [];
  const ratingFromUrl = (searchParams.get("rating") || "all") as "all" | "none" | "1+" | "2+" | "3+" | "4+" | "5";

  const [page, setPage] = useState(pageFromUrl);
  const [selectedItemForCollections, setSelectedItemForCollections] = useState<
    string | null
  >(null);
  const [selectedItemsForBulkCollections, setSelectedItemsForBulkCollections] =
    useState<string[]>([]);
  const { pageSize } = usePageSize();

  const {
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
  } = useMyItemsFilters();

  // Restore filter state from URL parameters on mount
  useEffect(() => {
    if (filterTypeFromUrl !== "all") {
      updateFilter("filterType", filterTypeFromUrl);
    }
    if (categoryFromUrl) {
      updateFilter("selectedCategory", categoryFromUrl);
      if (!activeFilters.has("category")) {
        addFilter("category");
      }
    }
    if (searchFromUrl) {
      updateFilter("searchText", searchFromUrl);
      if (!activeFilters.has("search")) {
        addFilter("search");
      }
    }
    if (keywordsFromUrl.length > 0) {
      updateFilter("selectedKeywords", keywordsFromUrl);
      if (!activeFilters.has("keywords")) {
        addFilter("keywords");
      }
    }
    if (ratingFromUrl !== "all") {
      updateFilter("ratingFilter", ratingFromUrl);
      if (!activeFilters.has("rating")) {
        addFilter("rating");
      }
    }
    // Only restore page if it's different from default
    if (pageFromUrl !== 1) {
      setPage(pageFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
  });

  // Determine isPrivate filter value based on filterType
  const isPrivateFilter =
    filters.filterType === "all"
      ? undefined
      : filters.filterType === "public"
        ? false
        : true;

  // Check if client-side filters are active (searchText or ratingFilter)
  const hasClientSideFilters = filters.searchText !== "" || filters.ratingFilter !== "all";

  // When client-side filters are active, fetch ALL items (use max pageSize of 1000, API limit)
  // Otherwise, use server-side pagination
  const queryPageSize = hasClientSideFilters ? 1000 : pageSize;
  const queryPage = hasClientSideFilters ? 1 : page;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "myItems",
      queryPage,
      filters.selectedCategory,
      filters.filterType,
      filters.selectedKeywords,
      hasClientSideFilters ? "all" : page, // Include page in key only when not using client-side filtering
    ],
    queryFn: () =>
      itemsApi.getAll(
        filters.selectedCategory || undefined,
        isPrivateFilter,
        filters.selectedKeywords.length > 0 ? filters.selectedKeywords : undefined,
        undefined, // collectionId
        undefined, // isRandom
        queryPage,
        queryPageSize
      ),
    enabled: isAuthenticated,
  });

  // Fetch ratings for all items
  const itemIds = (data?.items || []).map((item) => item.id);
  const { ratingsMap, isSuccess: ratingsLoaded } = useBulkRatings(itemIds);

  // Client-side filtering for search and rating
  const allFilteredItems = useMemo(
    () =>
      filterItems({
        items: data?.items || [],
        searchText: filters.searchText,
        ratingFilter: filters.ratingFilter,
        ratingsMap,
        ratingsLoaded,
      }),
    [
      data?.items,
      filters.searchText,
      filters.ratingFilter,
      ratingsMap,
      ratingsLoaded,
    ]
  );

  // Paginate filtered items client-side when client-side filters are active
  const displayItems = useMemo(() => {
    if (hasClientSideFilters) {
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      return allFilteredItems.slice(startIndex, endIndex);
    }
    return allFilteredItems;
  }, [allFilteredItems, hasClientSideFilters, page, pageSize]);

  // Calculate totalCount and totalPages based on filtered items
  const filteredTotalCount = hasClientSideFilters ? allFilteredItems.length : (data?.totalCount || 0);
  const filteredTotalPages = hasClientSideFilters 
    ? Math.ceil(allFilteredItems.length / pageSize) 
    : (data?.totalPages || 1);

  // Extract all unique keywords from items for keyword filter dropdown
  const availableKeywords = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.items || [])
            .flatMap((item) => item.keywords || [])
            .map((k) => k.name)
        )
      ).sort(),
    [data?.items]
  );

  const currentPageItemIds = displayItems.map((item) => item.id);
  const {
    selectedItemIds,
    selectedIds,
    toggleItem,
    selectAll,
    deselectAll,
  } = useItemSelection(currentPageItemIds, [
    page,
    filters.filterType,
    filters.selectedCategory,
    filters.searchText,
    filters.selectedKeywords,
    filters.ratingFilter,
  ]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => itemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myItems"] });
    },
  });

  // Reset to first page when filters change
  useEffect(() => {
    setPage(1);
  }, [
    filters.filterType,
    filters.selectedCategory,
    filters.searchText,
    filters.selectedKeywords,
    filters.ratingFilter,
  ]);

  // Reset page if it exceeds available pages (e.g., after filtering)
  // Only reset when data is loaded and page is actually invalid
  useEffect(() => {
    if (!isLoading && data && page > filteredTotalPages && filteredTotalPages > 0) {
      setPage(1);
    }
  }, [page, filteredTotalPages, isLoading, data]);

  // Determine available filters to add
  const allFilterTypes: FilterType[] = [
    "itemType",
    "category",
    "keywords",
    "search",
    "rating",
  ];
  const availableFiltersToAdd = allFilterTypes.filter(
    (f) => !activeFilters.has(f)
  );

  // Build returnUrl with current filter state for navigation back from explore mode
  const buildReturnUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", page.toString());
    if (filters.filterType !== "all") params.set("filterType", filters.filterType);
    if (filters.selectedCategory) params.set("category", filters.selectedCategory);
    if (filters.searchText) params.set("search", filters.searchText);
    if (filters.selectedKeywords.length > 0) {
      params.set("keywords", filters.selectedKeywords.join(","));
    }
    if (filters.ratingFilter !== "all") params.set("rating", filters.ratingFilter);
    const queryString = params.toString();
    return queryString ? `/my-items?${queryString}` : "/my-items";
  }, [
    page,
    filters.filterType,
    filters.selectedCategory,
    filters.searchText,
    filters.selectedKeywords,
    filters.ratingFilter,
  ]);

  // Early returns AFTER all hooks
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return (
      <ErrorMessage message="Failed to load items" onRetry={() => refetch()} />
    );

  const canEditDelete = (item: { isPrivate: boolean }) =>
    item.isPrivate || isAdmin;

  const handleAddSelectedToCollection = () => {
    if (selectedIds.length > 0) {
      setSelectedItemsForBulkCollections(selectedIds);
    }
  };

  const handleDelete = (itemId: string) => {
    deleteMutation.mutate(itemId);
  };

  const handleKeywordClick = (keywordName: string, item?: { category: string }) => {
    const newKeywords = filters.selectedKeywords.includes(keywordName)
      ? filters.selectedKeywords
      : [...filters.selectedKeywords, keywordName];
    const newCategory = item?.category && !filters.selectedCategory
      ? item.category
      : filters.selectedCategory;
    updateFilter("selectedKeywords", newKeywords);
    if (newCategory && newCategory !== filters.selectedCategory) {
      updateFilter("selectedCategory", newCategory);
      if (!activeFilters.has("category")) addFilter("category");
    }
    if (newKeywords.length > 0 && !activeFilters.has("keywords")) addFilter("keywords");
    setPage(1);
    const params = new URLSearchParams();
    if (filters.filterType !== "all") params.set("filterType", filters.filterType);
    if (newCategory) params.set("category", newCategory);
    if (newKeywords.length > 0) params.set("keywords", newKeywords.join(","));
    if (filters.searchText) params.set("search", filters.searchText);
    if (filters.ratingFilter !== "all") params.set("rating", filters.ratingFilter);
    navigate(`/my-items?${params.toString()}`, { replace: true });
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Items</h1>
        <p className="text-gray-600 text-sm">
          Review and manage quiz items. Browse public and private items, create
          and edit your own items, and organize items into collections by adding
          them to your private collections.
        </p>
      </div>
      <div className="mb-6 flex justify-end items-center">
        <div className="flex space-x-2">
          <button
            onClick={() => navigate("/my-items/bulk-create")}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Create Bulk
          </button>
          <button
            onClick={() => navigate("/items/create")}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Create Item
          </button>
        </div>
      </div>

      {/* Filters Section */}
      <FilterSection
        showFilters={showFilters}
        hasActiveFilters={hasActiveFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        onClearAll={clearAllFilters}
      >
        <AddFiltersSection
          availableFilters={availableFiltersToAdd}
          onAddFilter={addFilter}
        />

        {activeFilters.has("itemType") && (
          <ItemTypeFilter
            value={filters.filterType}
            onChange={(value) => updateFilter("filterType", value)}
            onRemove={() => removeFilter("itemType")}
          />
        )}

        {activeFilters.has("category") && (
          <CategoryFilter
            value={filters.selectedCategory}
            categories={categoriesData?.categories}
            onChange={(value) => updateFilter("selectedCategory", value)}
            onRemove={() => removeFilter("category")}
          />
        )}

        {activeFilters.has("keywords") && (
          <KeywordsFilter
            selectedKeywords={filters.selectedKeywords}
            availableKeywords={availableKeywords}
            onAddKeyword={(keyword) =>
              updateFilter("selectedKeywords", [
                ...filters.selectedKeywords,
                keyword,
              ])
            }
            onRemoveKeyword={removeKeyword}
            onRemove={() => removeFilter("keywords")}
          />
        )}

        {activeFilters.has("search") && (
          <SearchFilter
            value={filters.searchText}
            onChange={(value) => updateFilter("searchText", value)}
            onRemove={() => removeFilter("search")}
          />
        )}

        {activeFilters.has("rating") && (
          <RatingFilter
            value={filters.ratingFilter}
            onChange={(value) => updateFilter("ratingFilter", value)}
            onRemove={() => removeFilter("rating")}
          />
        )}
      </FilterSection>

      {/* Items List */}
      {displayItems.length > 0 ? (
        <ItemListSection
          items={displayItems}
          totalCount={filteredTotalCount}
          page={page}
          totalPages={filteredTotalPages}
          selectedItemIds={selectedItemIds}
          onPrevPage={() => setPage((p: number) => Math.max(1, p - 1))}
          onNextPage={() =>
            setPage((p: number) => Math.min(filteredTotalPages, p + 1))
          }
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onAddSelectedToCollection={handleAddSelectedToCollection}
          onToggleSelect={toggleItem}
          onKeywordClick={handleKeywordClick}
          selectedKeywords={filters.selectedKeywords}
          isAuthenticated={isAuthenticated}
          renderActions={(item) => (
            <MyItemsActions
              item={item}
              canEditDelete={canEditDelete(item)}
              onDelete={handleDelete}
              onManageCollections={setSelectedItemForCollections}
              isDeleting={deleteMutation.isPending}
              returnUrl={buildReturnUrl}
            />
          )}
        />
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">
            No items found matching your filters.
          </p>
        </div>
      )}

      {selectedItemForCollections && (
        <ItemCollectionsModal
          isOpen={!!selectedItemForCollections}
          onClose={() => setSelectedItemForCollections(null)}
          itemId={selectedItemForCollections}
        />
      )}

      <BulkItemCollectionsModal
        itemIds={selectedItemsForBulkCollections}
        onCloseComplete={() => {
          setSelectedItemsForBulkCollections([]);
          deselectAll();
        }}
      />
    </div>
  );
};

export default MyItemsPage;
