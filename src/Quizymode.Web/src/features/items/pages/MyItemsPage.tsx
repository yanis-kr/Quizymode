import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { useState, useEffect } from "react";
import { categoriesApi } from "@/api/categories";
import {
  EyeIcon,
  FolderIcon,
  PencilIcon,
  TrashIcon,
  AcademicCapIcon,
} from "@heroicons/react/24/outline";
import ItemCollectionsModal from "@/components/ItemCollectionsModal";

const SubcategoryDropdown = ({
  category,
  value,
  onChange,
}: {
  category: string;
  value: string;
  onChange: (value: string) => void;
}) => {
  const { data, isLoading } = useQuery({
    queryKey: ["subcategories", category],
    queryFn: () => categoriesApi.getSubcategories(category),
    enabled: !!category,
  });

  if (isLoading) {
    return (
      <select
        disabled
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
      >
        <option>Loading...</option>
      </select>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
    >
      <option value="">All Subcategories</option>
      {data?.subcategories.map((subcat) => (
        <option key={subcat.subcategory} value={subcat.subcategory}>
          {subcat.subcategory} ({subcat.count} items)
        </option>
      ))}
    </select>
  );
};

const MyItemsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<"all" | "global" | "private">(
    "all"
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [selectedItemForCollections, setSelectedItemForCollections] = useState<
    string | null
  >(null);
  const pageSize = 10;

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
  });

  // Determine isPrivate filter value based on filterType
  const isPrivateFilter =
    filterType === "all" ? undefined : filterType === "private";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "myItems",
      page,
      selectedCategory,
      selectedSubcategory,
      filterType,
      selectedKeywords,
    ],
    queryFn: () =>
      itemsApi.getAll(
        selectedCategory || undefined,
        selectedSubcategory || undefined,
        isPrivateFilter,
        selectedKeywords.length > 0 ? selectedKeywords : undefined,
        page,
        pageSize
      ),
    enabled: isAuthenticated,
  });

  // Client-side filtering for search only (isPrivate filtering is now server-side)
  // When searchText is empty, use items directly; otherwise filter by search
  const displayItems = searchText
    ? (data?.items || []).filter((item) => {
        const searchLower = searchText.toLowerCase();
        return (
          item.question.toLowerCase().includes(searchLower) ||
          item.correctAnswer.toLowerCase().includes(searchLower) ||
          item.explanation?.toLowerCase().includes(searchLower) ||
          false
        );
      })
    : data?.items || [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => itemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myItems"] });
    },
  });

  useEffect(() => {
    setPage(1); // Reset to first page when filters change
  }, [filterType, selectedCategory, selectedSubcategory, searchText, selectedKeywords]);

  const handleKeywordClick = (keywordName: string) => {
    if (!selectedKeywords.includes(keywordName)) {
      setSelectedKeywords([...selectedKeywords, keywordName]);
    }
  };

  const removeKeyword = (keywordName: string) => {
    setSelectedKeywords(selectedKeywords.filter((k) => k !== keywordName));
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return (
      <ErrorMessage message="Failed to load items" onRetry={() => refetch()} />
    );

  const canEditDelete = (item: any) => item.isPrivate || isAdmin;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">My Items</h1>
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
            <SubcategoryDropdown
              category={selectedCategory}
              value={selectedSubcategory}
              onChange={setSelectedSubcategory}
            />
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

        {/* Selected Keywords Filter */}
        {selectedKeywords.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filtered by Keywords
            </label>
            <div className="flex flex-wrap gap-2">
              {selectedKeywords.map((keyword) => (
                <span
                  key={keyword}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800"
                >
                  {keyword}
                  <button
                    onClick={() => removeKeyword(keyword)}
                    className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-indigo-200"
                    aria-label={`Remove ${keyword} filter`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Items List */}
      {displayItems.length > 0 ? (
        <>
          <div className="space-y-4 mb-6">
            {displayItems.map((item) => (
              <div key={item.id} className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">
                      {item.question}
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">
                      {item.category}{" "}
                      {item.subcategory && `• ${item.subcategory}`}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {item.isPrivate ? "Private" : "Global"}
                    </p>
                    <p className="mt-2 text-sm text-gray-700">
                      <strong>Answer:</strong> {item.correctAnswer}
                    </p>
                    {/* Keywords */}
                    {item.keywords && item.keywords.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.keywords.map((keyword) => (
                          <button
                            key={keyword.id}
                            onClick={() => handleKeywordClick(keyword.name)}
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium transition-colors ${
                              selectedKeywords.includes(keyword.name)
                                ? "bg-indigo-600 text-white"
                                : keyword.isPrivate
                                ? "bg-purple-100 text-purple-800 hover:bg-purple-200"
                                : "bg-blue-100 text-blue-800 hover:bg-blue-200"
                            }`}
                            title={
                              keyword.isPrivate
                                ? "Private keyword (click to filter)"
                                : "Global keyword (click to filter)"
                            }
                          >
                            {keyword.name}
                            {keyword.isPrivate && (
                              <span className="ml-1 text-[10px]">🔒</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-1 ml-4">
                    <button
                      onClick={() => navigate(`/explore/item/${item.id}`)}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md"
                      title="View item"
                    >
                      <EyeIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => navigate(`/quiz/item/${item.id}`)}
                      className="p-2 text-purple-600 hover:bg-purple-50 rounded-md"
                      title="Quiz mode"
                    >
                      <AcademicCapIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setSelectedItemForCollections(item.id)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-md"
                      title="Manage collections"
                    >
                      <FolderIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => navigate(`/items/${item.id}/edit`)}
                      disabled={!canEditDelete(item)}
                      className={`p-2 rounded-md ${
                        canEditDelete(item)
                          ? "text-indigo-600 hover:bg-indigo-50"
                          : "text-gray-400 cursor-not-allowed"
                      }`}
                      title={
                        !canEditDelete(item)
                          ? "Only admins can edit global items"
                          : "Update item"
                      }
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            "Are you sure you want to delete this item?"
                          )
                        ) {
                          deleteMutation.mutate(item.id);
                        }
                      }}
                      disabled={
                        !canEditDelete(item) || deleteMutation.isPending
                      }
                      className={`p-2 rounded-md ${
                        canEditDelete(item)
                          ? "text-red-600 hover:bg-red-50"
                          : "text-gray-400 cursor-not-allowed"
                      }`}
                      title={
                        !canEditDelete(item)
                          ? "Only admins can delete global items"
                          : "Delete item"
                      }
                    >
                      <TrashIcon className="h-5 w-5" />
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

      {selectedItemForCollections && (
        <ItemCollectionsModal
          isOpen={!!selectedItemForCollections}
          onClose={() => setSelectedItemForCollections(null)}
          itemId={selectedItemForCollections}
        />
      )}
    </div>
  );
};

export default MyItemsPage;
