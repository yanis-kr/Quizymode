import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { categoriesApi } from "@/api/categories";
import { itemsApi } from "@/api/items";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import ItemListSection from "@/components/ItemListSection";
import BulkItemCollectionsModal from "@/components/BulkItemCollectionsModal";
import useItemSelection from "@/hooks/useItemSelection";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSize } from "@/hooks/usePageSize";
import { SEO } from "@/components/SEO";
import {
  categoryNameToSlug,
  findCategoryNameFromSlug,
} from "@/utils/categorySlug";
import {
  AcademicCapIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";

type SortOption = "name" | "rating" | "count";

const CategoriesPage = () => {
  const { isAuthenticated } = useAuth();
  const { category: categoryParam } = useParams<{ category?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");

  // Get category from URL params (route param takes precedence over query param)
  const categoryFromUrl = categoryParam || searchParams.get("category");
  const pageFromUrl = parseInt(searchParams.get("page") || "1", 10);
  const pageSizeFromUrl = parseInt(searchParams.get("pagesize") || "10", 10);
  const sortFromUrl = (searchParams.get("sort") || "rating") as SortOption;
  const categoriesPageFromUrl = parseInt(
    searchParams.get("categoriesPage") || "1",
    10,
  );

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryView, setCategoryView] = useState<"actions" | "items">(
    categoryFromUrl ? "items" : "actions",
  );
  const [itemsPage, setItemsPage] = useState(pageFromUrl);
  const [selectedItemsForBulkCollections, setSelectedItemsForBulkCollections] =
    useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>(sortFromUrl);
  const [categoriesPage, setCategoriesPage] = useState(categoriesPageFromUrl);
  const { pageSize: userPageSize } = usePageSize();
  // Use page size from URL if present, otherwise use user setting, otherwise default to 10
  const pageSize = pageSizeFromUrl !== 10 ? pageSizeFromUrl : userPageSize;
  const navigate = useNavigate();

  const CATEGORIES_PER_PAGE = 30;

  // Reset pagination when search changes
  useEffect(() => {
    if (!categoryFromUrl && categoriesPage !== 1) {
      setCategoriesPage(1);
      const newParams = new URLSearchParams(searchParams);
      newParams.set("categoriesPage", "1");
      setSearchParams(newParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["categories", search],
    queryFn: () => categoriesApi.getAll(search || undefined),
  });

  // Update state when URL params change
  useEffect(() => {
    if (categoryFromUrl && data?.categories) {
      // Convert slug from URL to actual category name
      const categoryNames = data.categories.map((c) => c.category);
      const actualCategoryName = findCategoryNameFromSlug(
        categoryFromUrl,
        categoryNames,
      );
      if (actualCategoryName) {
        setSelectedCategory(actualCategoryName);
        setCategoryView("items");
        setItemsPage(pageFromUrl);
      } else {
        // If category not found, clear selection
        setSelectedCategory(null);
        setCategoryView("actions");
      }
    } else {
      setSelectedCategory(null);
      setCategoryView("actions");
    }
    setSortBy(sortFromUrl);
    setCategoriesPage(categoriesPageFromUrl);
  }, [
    categoryFromUrl,
    pageFromUrl,
    sortFromUrl,
    categoriesPageFromUrl,
    data?.categories,
  ]);

  // Sort and paginate categories
  const sortedAndPaginatedCategories = useMemo(() => {
    if (!data?.categories)
      return { categories: [], totalCount: 0, totalPages: 0 };

    const sorted = [...data.categories].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.category.localeCompare(b.category);
        case "rating":
          const aRating = a.averageStars ?? -1;
          const bRating = b.averageStars ?? -1;
          if (aRating !== bRating) {
            return bRating - aRating; // Descending by rating
          }
          return a.category.localeCompare(b.category); // Then by name
        case "count":
          if (a.count !== b.count) {
            return b.count - a.count; // Descending by count
          }
          return a.category.localeCompare(b.category); // Then by name
        default:
          return 0;
      }
    });

    const totalCount = sorted.length;
    const totalPages = Math.ceil(totalCount / CATEGORIES_PER_PAGE);
    const startIndex = (categoriesPage - 1) * CATEGORIES_PER_PAGE;
    const endIndex = startIndex + CATEGORIES_PER_PAGE;
    const paginated = sorted.slice(startIndex, endIndex);

    return {
      categories: paginated,
      totalCount,
      totalPages,
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, totalCount),
    };
  }, [data?.categories, sortBy, categoriesPage]);

  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort);
    setCategoriesPage(1);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("sort", newSort);
    newParams.set("categoriesPage", "1");
    setSearchParams(newParams);
  };

  const handleCategoriesPageChange = (newPage: number) => {
    setCategoriesPage(newPage);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("categoriesPage", newPage.toString());
    setSearchParams(newParams);
    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setCategoryView("actions");
    setItemsPage(1);
  };

  const handleCategoryItems = (category: string) => {
    setSelectedCategory(category);
    setCategoryView("items");
    setItemsPage(1);
    // Navigate to /categories/{category-slug}?page=1&pagesize={pageSize}
    navigate(
      `/categories/${categoryNameToSlug(category)}?page=1&pagesize=${pageSize}`,
    );
  };

  const handleExplore = () => {
    if (!selectedCategory) return;
    navigate(`/explore/${categoryNameToSlug(selectedCategory)}`);
  };

  const handleQuiz = () => {
    if (!selectedCategory) return;
    navigate(`/quiz/${categoryNameToSlug(selectedCategory)}`);
  };

  const handleBack = () => {
    setSelectedCategory(null);
    setCategoryView("actions");
    navigate("/categories");
  };

  // Update URL when page changes
  const handlePageChange = (newPage: number) => {
    setItemsPage(newPage);
    if (selectedCategory) {
      navigate(
        `/categories/${categoryNameToSlug(selectedCategory)}?page=${newPage}&pagesize=${pageSize}`,
      );
    }
  };

  const {
    data: itemsData,
    isLoading: isLoadingItems,
    error: itemsError,
    refetch: refetchItems,
  } = useQuery({
    queryKey: ["categoryItems", selectedCategory, itemsPage],
    queryFn: () =>
      itemsApi.getAll(
        selectedCategory || undefined,
        undefined,
        undefined,
        undefined, // collectionId
        undefined, // isRandom
        itemsPage,
        pageSize,
      ),
    enabled: !!selectedCategory && categoryView === "items",
  });

  const currentPageItemIds = (itemsData?.items || []).map((item) => item.id);
  const { selectedItemIds, selectedIds, toggleItem, selectAll, deselectAll } =
    useItemSelection(currentPageItemIds, [
      itemsPage,
      selectedCategory,
      categoryView,
    ]);

  const handleAddSelectedToCollection = () => {
    if (selectedIds.length > 0) {
      setSelectedItemsForBulkCollections(selectedIds);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return (
      <ErrorMessage
        message="Failed to load categories"
        onRetry={() => refetch()}
      />
    );

  if (selectedCategory && categoryView === "items") {
    if (isLoadingItems) return <LoadingSpinner />;
    if (itemsError)
      return (
        <ErrorMessage
          message="Failed to load items"
          onRetry={() => refetchItems()}
        />
      );

    const canonicalUrl = `https://www.quizymode.com/categories/${categoryNameToSlug(selectedCategory)}`;

    return (
      <>
        <SEO
          title={`${selectedCategory} Category`}
          description={`Browse items in the ${selectedCategory} category on Quizymode.`}
          canonical={canonicalUrl}
        />
        <div className="px-4 py-6 sm:px-0">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={handleBack}
              className="mb-4 text-sm text-indigo-600 hover:text-indigo-800"
            >
              ← Back to Categories
            </button>

            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">
                Items in: {selectedCategory}
              </h1>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              Browse all items in this category. Use the filters to find
              specific items, or select items to add them to collections.
            </p>
            <div className="flex items-center gap-3 mb-6">
              {(() => {
                const categoryData = data?.categories.find(
                  (c) => c.category === selectedCategory,
                );
                return categoryData ? (
                  <span
                    className={`px-3 py-1 text-sm font-medium rounded ${
                      categoryData.isPrivate
                        ? "bg-purple-100 text-purple-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {categoryData.isPrivate ? "Private" : "Public"}
                  </span>
                ) : null;
              })()}
            </div>

            {itemsData?.items && itemsData.items.length > 0 ? (
              <ItemListSection
                items={itemsData.items}
                totalCount={itemsData.totalCount}
                page={itemsPage}
                totalPages={itemsData.totalPages}
                selectedItemIds={selectedItemIds}
                onPrevPage={() => handlePageChange(Math.max(1, itemsPage - 1))}
                onNextPage={() =>
                  handlePageChange(
                    Math.min(itemsData.totalPages, itemsPage + 1),
                  )
                }
                onSelectAll={selectAll}
                onDeselectAll={deselectAll}
                onAddSelectedToCollection={handleAddSelectedToCollection}
                onToggleSelect={toggleItem}
                isAuthenticated={isAuthenticated}
                renderActions={(item) => (
                  <button
                    onClick={() => {
                      const returnUrl = `/categories/${categoryNameToSlug(selectedCategory!)}?page=${itemsPage}&pagesize=${pageSize}`;
                      navigate(`/explore/item/${item.id}?return=${encodeURIComponent(returnUrl)}`);
                    }}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md"
                    title="View item details"
                  >
                    <EyeIcon className="h-5 w-5" />
                  </button>
                )}
              />
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">
                  No items found in this category.
                </p>
              </div>
            )}
          </div>

          <BulkItemCollectionsModal
            itemIds={selectedItemsForBulkCollections}
            onCloseComplete={() => {
              setSelectedItemsForBulkCollections([]);
              deselectAll();
            }}
          />
        </div>
      </>
    );
  }

  if (selectedCategory) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleBack}
            className="mb-4 text-sm text-indigo-600 hover:text-indigo-800"
          >
            ← Back to Categories
          </button>

          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">
              Category: {selectedCategory}
            </h1>
          </div>
          <p className="text-gray-600 text-sm mb-6">
            Choose an action for this category: explore items to view questions
            and answers, take a quiz to test your knowledge, or browse the item
            list.
          </p>
          <div className="flex items-center gap-3 mb-6">
            {(() => {
              const categoryData = data?.categories.find(
                (c) => c.category === selectedCategory,
              );
              return categoryData ? (
                <span
                  className={`px-3 py-1 text-sm font-medium rounded ${
                    categoryData.isPrivate
                      ? "bg-purple-100 text-purple-800"
                      : "bg-green-100 text-green-800"
                  }`}
                >
                  {categoryData.isPrivate ? "Private" : "Public"}
                </span>
              ) : null;
            })()}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <button
              onClick={handleExplore}
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow p-6 text-left"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Explore Mode
              </h3>
              <p className="text-sm text-gray-500">
                View questions with answers and explanations
              </p>
            </button>
            <button
              onClick={handleQuiz}
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow p-6 text-left"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Quiz Mode
              </h3>
              <p className="text-sm text-gray-500">
                Test yourself with multiple choice questions
              </p>
            </button>
            <button
              onClick={() => handleCategoryItems(selectedCategory)}
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow p-6 text-left"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                List Mode
              </h3>
              <p className="text-sm text-gray-500">
                Browse items with ratings and collections
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title="Categories"
        description="Browse all categories on Quizymode. Find flashcards and quizzes organized by topic."
        canonical="https://www.quizymode.com/categories"
      />
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Select a Category
          </h1>
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="max-w-md">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-2 pr-10 border"
                />
                {search.trim().length > 0 && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                    aria-label="Clear search"
                    type="button"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="sort-select"
                className="text-sm font-medium text-gray-700"
              >
                Sort by:
              </label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value as SortOption)}
                className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              >
                <option value="rating">Avg.Rating</option>
                <option value="name">Name</option>
                <option value="count">Number of Items</option>
              </select>
            </div>
          </div>
          {sortedAndPaginatedCategories.totalCount > 0 && (
            <div className="text-sm text-gray-600 mb-4">
              Showing {sortedAndPaginatedCategories.startIndex}-
              {sortedAndPaginatedCategories.endIndex} of{" "}
              {sortedAndPaginatedCategories.totalCount} categories
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedAndPaginatedCategories.categories.map((category) => (
            <button
              key={category.category}
              onClick={() => handleCategorySelect(category.category)}
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow p-6 text-left"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium text-gray-900">
                      {category.category}
                    </h3>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        category.isPrivate
                          ? "bg-purple-100 text-purple-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {category.isPrivate ? "Private" : "Public"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    {category.count} items
                  </p>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      // Navigate to explore mode for anonymous users
                      navigate(`/explore/${categoryNameToSlug(category.category)}`);
                    }}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md"
                    title="Explore"
                    aria-label={`Explore ${category.category}`}
                    type="button"
                  >
                    <MagnifyingGlassIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/quiz/${categoryNameToSlug(category.category)}`);
                    }}
                    className="p-2 text-purple-600 hover:bg-purple-50 rounded-md"
                    title="Quiz"
                    aria-label={`Quiz ${category.category}`}
                    type="button"
                  >
                    <AcademicCapIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      // Navigate to item list mode with category in URL
                      navigate(
                        `/categories/${categoryNameToSlug(category.category)}?page=1&pagesize=10`,
                      );
                    }}
                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md"
                    title="List items"
                    aria-label={`List items in ${category.category}`}
                    type="button"
                  >
                    <ListBulletIcon className="h-5 w-5" />
                  </button>
                  {category.averageStars !== null &&
                    category.averageStars !== undefined && (
                      <div className="flex items-center space-x-1">
                        <svg
                          className="w-5 h-5 text-yellow-400 fill-current"
                          viewBox="0 0 20 20"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">
                          {category.averageStars.toFixed(1)}
                        </span>
                      </div>
                    )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {sortedAndPaginatedCategories.categories.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No categories found.</p>
          </div>
        )}

        {/* Pagination Controls */}
        {sortedAndPaginatedCategories.totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() =>
                  handleCategoriesPageChange(Math.max(1, categoriesPage - 1))
                }
                disabled={categoriesPage === 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  handleCategoriesPageChange(
                    Math.min(
                      sortedAndPaginatedCategories.totalPages,
                      categoriesPage + 1,
                    ),
                  )
                }
                disabled={
                  categoriesPage === sortedAndPaginatedCategories.totalPages
                }
                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Page <span className="font-medium">{categoriesPage}</span> of{" "}
                  <span className="font-medium">
                    {sortedAndPaginatedCategories.totalPages}
                  </span>
                </p>
              </div>
              <div>
                <nav
                  className="isolate inline-flex -space-x-px rounded-md shadow-sm"
                  aria-label="Pagination"
                >
                  <button
                    onClick={() =>
                      handleCategoriesPageChange(
                        Math.max(1, categoriesPage - 1),
                      )
                    }
                    disabled={categoriesPage === 1}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                  {Array.from(
                    { length: sortedAndPaginatedCategories.totalPages },
                    (_, i) => i + 1,
                  )
                    .filter((page) => {
                      // Show first page, last page, current page, and pages around current
                      if (page === 1) return true;
                      if (page === sortedAndPaginatedCategories.totalPages)
                        return true;
                      if (Math.abs(page - categoriesPage) <= 1) return true;
                      return false;
                    })
                    .map((page, index, array) => {
                      // Add ellipsis if there's a gap
                      const showEllipsisBefore =
                        index > 0 && page - array[index - 1] > 1;
                      return (
                        <div key={page} className="flex items-center">
                          {showEllipsisBefore && (
                            <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">
                              ...
                            </span>
                          )}
                          <button
                            onClick={() => handleCategoriesPageChange(page)}
                            className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                              page === categoriesPage
                                ? "z-10 bg-indigo-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                                : "text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                            }`}
                          >
                            {page}
                          </button>
                        </div>
                      );
                    })}
                  <button
                    onClick={() =>
                      handleCategoriesPageChange(
                        Math.min(
                          sortedAndPaginatedCategories.totalPages,
                          categoriesPage + 1,
                        ),
                      )
                    }
                    disabled={
                      categoriesPage === sortedAndPaginatedCategories.totalPages
                    }
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default CategoriesPage;
