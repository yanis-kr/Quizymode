import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { useState, useEffect } from "react";
import { categoriesApi } from "@/api/categories";

const MyItemsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<"all" | "global" | "private">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const pageSize = 10;

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["myItems", page, selectedCategory, selectedSubcategory],
    queryFn: () =>
      itemsApi.getAll(
        selectedCategory || undefined,
        selectedSubcategory || undefined,
        page,
        pageSize
      ),
    enabled: isAuthenticated,
  });

  // Client-side filtering for type and search (API doesn't support these yet)
  const filteredItems = (data?.items || []).filter((item) => {
    if (filterType === "global" && item.isPrivate) return false;
    if (filterType === "private" && !item.isPrivate) return false;
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      return (
        item.question.toLowerCase().includes(searchLower) ||
        item.correctAnswer.toLowerCase().includes(searchLower) ||
        item.explanation?.toLowerCase().includes(searchLower) ||
        false
      );
    }
    return true;
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => itemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myItems"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => itemsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myItems"] });
    },
  });

  useEffect(() => {
    setPage(1); // Reset to first page when filters change
  }, [filterType, selectedCategory, selectedSubcategory, searchText]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load items" onRetry={() => refetch()} />;

  const items = data?.items || [];
  const totalPages = data?.totalPages || 1;
  const canEditDelete = (item: any) => item.isPrivate || isAdmin;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">My Items</h1>
        <button
          onClick={() => navigate("/items/create")}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Create Item
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-4 bg-white p-4 rounded-lg shadow">
        {/* Filter Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Type
          </label>
          <div className="flex space-x-4">
            <button
              onClick={() => setFilterType("all")}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filterType === "all"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType("global")}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filterType === "global"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Global
            </button>
            <button
              onClick={() => setFilterType("private")}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filterType === "private"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Private
            </button>
          </div>
        </div>

        {/* Category Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedSubcategory(""); // Reset subcategory when category changes
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">All Categories</option>
            {categoriesData?.categories.map((cat) => (
              <option key={cat.category} value={cat.category}>
                {cat.category}
              </option>
            ))}
          </select>
        </div>

        {/* Subcategory Filter */}
        {selectedCategory && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subcategory
            </label>
            <select
              value={selectedSubcategory}
              onChange={(e) => setSelectedSubcategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All Subcategories</option>
              {/* Note: You may need to fetch subcategories separately or from items */}
            </select>
          </div>
        )}

        {/* Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search
          </label>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search questions, answers, explanations..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>

      {/* Items List */}
      {filteredItems.length > 0 ? (
        <>
          <div className="space-y-4 mb-6">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">{item.question}</h3>
                    <p className="mt-2 text-sm text-gray-500">
                      {item.category} {item.subcategory && `• ${item.subcategory}`}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {item.isPrivate ? "Private" : "Global"}
                    </p>
                    <p className="mt-2 text-sm text-gray-700">
                      <strong>Answer:</strong> {item.correctAnswer}
                    </p>
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => navigate(`/items/${item.id}/edit`)}
                      disabled={!canEditDelete(item)}
                      className={`px-4 py-2 text-sm rounded-md ${
                        canEditDelete(item)
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      }`}
                      title={
                        !canEditDelete(item)
                          ? "Only admins can edit global items"
                          : "Edit item"
                      }
                    >
                      Update
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("Are you sure you want to delete this item?")) {
                          deleteMutation.mutate(item.id);
                        }
                      }}
                      disabled={!canEditDelete(item) || deleteMutation.isPending}
                      className={`px-4 py-2 text-sm rounded-md ${
                        canEditDelete(item)
                          ? "bg-red-600 text-white hover:bg-red-700"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      }`}
                      title={
                        !canEditDelete(item)
                          ? "Only admins can delete global items"
                          : "Delete item"
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {/* Note: Pagination works on server-side filtered results, not client-side filtered */}
          {data && data.totalPages > 1 && (
            <div className="flex justify-center items-center space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {page} of {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No items found matching your filters.</p>
        </div>
      )}
    </div>
  );
};

export default MyItemsPage;
