import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { categoriesApi } from "@/api/categories";
import { itemsApi } from "@/api/items";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import ItemListSection from "@/components/ItemListSection";
import BulkItemCollectionsModal from "@/components/BulkItemCollectionsModal";
import useItemSelection from "@/hooks/useItemSelection";
import {
  AcademicCapIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const CategoriesPage = () => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryView, setCategoryView] = useState<"actions" | "items">(
    "actions"
  );
  const [itemsPage, setItemsPage] = useState(1);
  const [selectedItemsForBulkCollections, setSelectedItemsForBulkCollections] =
    useState<string[]>([]);
  const pageSize = 10;
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["categories", search],
    queryFn: () => categoriesApi.getAll(search || undefined),
  });

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setCategoryView("actions");
    setItemsPage(1);
  };

  const handleCategoryItems = (category: string) => {
    setSelectedCategory(category);
    setCategoryView("items");
    setItemsPage(1);
  };

  const handleExplore = () => {
    if (!selectedCategory) return;
    navigate(`/explore/${encodeURIComponent(selectedCategory)}`);
  };

  const handleQuiz = () => {
    if (!selectedCategory) return;
    navigate(`/quiz/${encodeURIComponent(selectedCategory)}`);
  };

  const handleBack = () => {
    setSelectedCategory(null);
    setCategoryView("actions");
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
        itemsPage,
        pageSize
      ),
    enabled: !!selectedCategory && categoryView === "items",
  });

  const currentPageItemIds = (itemsData?.items || []).map((item) => item.id);
  const {
    selectedItemIds,
    selectedIds,
    toggleItem,
    selectAll,
    deselectAll,
  } = useItemSelection(currentPageItemIds, [
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

    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={handleBack}
            className="mb-4 text-sm text-indigo-600 hover:text-indigo-800"
          >
            ← Back to Categories
          </button>

          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Items in: {selectedCategory}
          </h1>

          {itemsData?.items && itemsData.items.length > 0 ? (
            <ItemListSection
              items={itemsData.items}
              totalCount={itemsData.totalCount}
              page={itemsPage}
              totalPages={itemsData.totalPages}
              selectedItemIds={selectedItemIds}
              onPrevPage={() => setItemsPage((p) => Math.max(1, p - 1))}
              onNextPage={() =>
                setItemsPage((p) => Math.min(itemsData.totalPages, p + 1))
              }
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              onAddSelectedToCollection={handleAddSelectedToCollection}
              onToggleSelect={toggleItem}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No items found in this category.</p>
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

          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Category: {selectedCategory}
          </h1>

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
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Select a Category
        </h1>
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.categories.map((category) => (
          <button
            key={category.category}
            onClick={() => handleCategorySelect(category.category)}
            className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow p-6 text-left"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-medium text-gray-900">
                  {category.category}
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  {category.count} items
                </p>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(
                      `/explore/${encodeURIComponent(category.category)}`
                    );
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
                    navigate(`/quiz/${encodeURIComponent(category.category)}`);
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
                    handleCategoryItems(category.category);
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

      {data?.categories.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No categories found.</p>
        </div>
      )}
    </div>
  );
};

export default CategoriesPage;
