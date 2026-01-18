import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { categoriesApi } from "@/api/categories";
import { itemsApi } from "@/api/items";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import ItemListCard from "@/components/ItemListCard";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

const CategoriesPage = () => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryView, setCategoryView] = useState<"actions" | "items">(
    "actions"
  );
  const [itemsPage, setItemsPage] = useState(1);
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
            <>
              <div className="space-y-4 mb-6">
                {itemsData.items.map((item) => (
                  <ItemListCard key={item.id} item={item} />
                ))}
              </div>

              {itemsData.totalPages > 1 && (
                <div className="flex justify-center items-center space-x-2">
                  <button
                    onClick={() => setItemsPage((p) => Math.max(1, p - 1))}
                    disabled={itemsPage === 1}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {itemsPage} of {itemsData.totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setItemsPage((p) =>
                        Math.min(itemsData.totalPages, p + 1)
                      )
                    }
                    disabled={itemsPage === itemsData.totalPages}
                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No items found in this category.</p>
            </div>
          )}
        </div>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    handleCategoryItems(category.category);
                  }}
                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md"
                  title="Show items"
                  aria-label={`Show items in ${category.category}`}
                  type="button"
                >
                  <PlusIcon className="h-5 w-5" />
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
