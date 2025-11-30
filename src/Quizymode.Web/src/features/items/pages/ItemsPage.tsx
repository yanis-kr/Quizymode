import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";

const ItemsPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const category = searchParams.get("category") || undefined;
  const [mode, setMode] = useState<"explore" | "quiz" | null>(null);
  const [count, setCount] = useState(10);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["randomItems", category, count],
    queryFn: () => itemsApi.getRandom(category, undefined, count),
    enabled: mode !== null,
  });

  const handleStart = () => {
    if (!mode) return;
    const path = mode === "explore" ? "/explore" : "/quiz";
    const url = category ? `${path}/${encodeURIComponent(category)}` : path;
    navigate(url);
  };

  const handleItemClick = (itemId: string) => {
    if (!mode || !data?.items) return;
    const path = mode === "explore" ? "/explore" : "/quiz";

    // Store items in sessionStorage so Quiz/Explore mode can use them
    const storageKey =
      mode === "explore"
        ? "navigationContext_explore"
        : "navigationContext_quiz";
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        mode: mode,
        category: category,
        items: data.items,
        currentIndex: data.items.findIndex((item) => item.id === itemId),
      })
    );

    if (category) {
      navigate(`${path}/${encodeURIComponent(category)}/item/${itemId}`);
    } else {
      navigate(`${path}/item/${itemId}`);
    }
  };

  // Reset to page 1 when mode or category changes
  useEffect(() => {
    setPage(1);
  }, [mode, category]);

  if (mode === null) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            {category ? `Category: ${category}` : "Get Random Items"}
          </h1>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Number of items
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 10)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-2 border"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              onClick={() => setMode("explore")}
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
              onClick={() => setMode("quiz")}
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

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return (
      <ErrorMessage message="Failed to load items" onRetry={() => refetch()} />
    );

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          {mode === "explore" ? "Explore Mode" : "Quiz Mode"}
        </h1>

        {data?.items && data.items.length > 0 ? (
          <div className="space-y-4">
            {/* Show paginated items */}
            {data.items
              .slice((page - 1) * pageSize, page * pageSize)
              .map((item) => (
                <div
                  key={item.id}
                  className="bg-white shadow rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handleItemClick(item.id)}
                >
                  <p className="text-gray-900 font-medium">
                    {item.question.length > 100
                      ? `${item.question.substring(0, 100)}...`
                      : item.question}
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    {item.category}{" "}
                    {item.subcategory && `• ${item.subcategory}`}
                  </p>
                </div>
              ))}

            {/* Pagination controls */}
            {data.items.length > pageSize && (
              <div className="flex justify-center items-center space-x-2 mt-6">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPage((p) => Math.max(1, p - 1));
                  }}
                  disabled={page === 1}
                  className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-700">
                  Page {page} of {Math.ceil(data.items.length / pageSize)} (
                  {data.items.length} items)
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPage((p) =>
                      Math.min(Math.ceil(data.items.length / pageSize), p + 1)
                    );
                  }}
                  disabled={page >= Math.ceil(data.items.length / pageSize)}
                  className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}

            <div className="flex justify-center mt-6">
              <button
                onClick={handleStart}
                className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
              >
                Start {mode === "explore" ? "Exploring" : "Quiz"}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No items found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemsPage;
