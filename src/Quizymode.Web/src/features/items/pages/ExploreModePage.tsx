import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { collectionsApi } from "@/api/collections";
import { categoriesApi } from "@/api/categories";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import ItemRatingsComments from "@/components/ItemRatingsComments";
import ItemCollectionsModal from "@/components/ItemCollectionsModal";
import { Link } from "react-router-dom";
import {
  categoryNameToSlug,
  findCategoryNameFromSlug,
} from "@/utils/categorySlug";
import {
  FolderIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

const ExploreModePage = () => {
  const { category: categorySlug, collectionId, itemId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const returnUrl = searchParams.get("return");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [count] = useState(100); // Increased default to fetch more items
  const [selectedItemForCollections, setSelectedItemForCollections] = useState<
    string | null
  >(null);

  // Fetch categories to convert slug to actual category name
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: !!categorySlug && !collectionId,
  });

  // Convert category slug to actual category name
  const category = useMemo(() => {
    if (!categorySlug) return undefined;
    if (!categoriesData?.categories) return categorySlug; // Fallback to slug if categories not loaded
    const categoryNames = categoriesData.categories.map((c) => c.category);
    const actualCategoryName = findCategoryNameFromSlug(
      categorySlug,
      categoryNames,
    );
    return actualCategoryName || categorySlug; // Fallback to slug if not found
  }, [categorySlug, categoriesData?.categories]);

  // Check sessionStorage for stored items (when navigating with itemId from ItemsPage or comments)
  // Must be declared before useQuery that references it
  // Initialize synchronously from sessionStorage to avoid race conditions
  // Restore if we have an itemId (meaning we're navigating to a specific item)
  const getStoredItems = (): any[] | null => {
    if (!collectionId && itemId) {
      // Restore when navigating to a specific item (from ItemsPage or comments)
      const stored = sessionStorage.getItem("navigationContext_explore");
      if (stored) {
        try {
          const context = JSON.parse(stored);
          if (context.items && context.mode === "explore") {
            // Only restore if category matches (or both are undefined/null)
            const categoryMatches =
              (!context.category && !category) || context.category === category;
            if (categoryMatches) {
              return context.items;
            }
          }
        } catch (e) {
          // Invalid stored data, ignore
        }
      }
    }
    return null;
  };

  const [storedItems, setStoredItems] = useState<any[] | null>(
    getStoredItems()
  );
  const [hasRestoredItems, setHasRestoredItems] = useState(false);

  const { data: singleItemData, isLoading: singleItemLoading } = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => itemsApi.getById(itemId!),
    enabled: !!itemId, // Always fetch when itemId is present to get latest data including collections
  });

  const { data: collectionData, isLoading: collectionLoading } = useQuery({
    queryKey: ["collectionItems", collectionId],
    queryFn: () => collectionsApi.getItems(collectionId!),
    enabled: !!collectionId, // Load even when itemId is present to get full list
  });

  const { data: collectionInfo } = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: () => collectionsApi.getById(collectionId!),
    enabled: !!collectionId && isAuthenticated,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["randomItems", category, count],
    queryFn: () => itemsApi.getRandom(category, count),
    enabled: !collectionId && !storedItems, // Don't load if we have stored items
  });

  // Restore items and index from sessionStorage on mount
  // Restore when navigating to a specific item (itemId present)
  useEffect(() => {
    if (!hasRestoredItems && !collectionId && itemId && storedItems) {
      const stored = sessionStorage.getItem("navigationContext_explore");
      if (stored) {
        try {
          const context = JSON.parse(stored);
          if (
            context.items &&
            context.mode === "explore" &&
            context.items.length > 0
          ) {
            // Only restore if category matches (or both are undefined/null)
            const categoryMatches =
              (!context.category && !category) || context.category === category;
            if (categoryMatches) {
              // Set storedItems state with the full items list
              setStoredItems(context.items);

              // Find the index of the current itemId in stored items
              const index = context.items.findIndex(
                (item: any) => item.id === itemId
              );
              if (index !== -1) {
                setCurrentIndex(index);
              }

              // Clear sessionStorage after restoring state
              sessionStorage.removeItem("navigationContext_explore");
              setHasRestoredItems(true);
            }
          }
        } catch (e) {
          // Invalid stored data, ignore
        }
      }
    }
  }, [itemId, hasRestoredItems, category, collectionId]);

  // Clear sessionStorage when starting a fresh explore (no itemId, no collectionId)
  // This ensures we always fetch fresh items instead of restoring old ones
  useEffect(() => {
    if (!itemId && !collectionId && !hasRestoredItems) {
      // Clear old sessionStorage for this category when starting fresh
      const stored = sessionStorage.getItem("navigationContext_explore");
      if (stored) {
        try {
          const context = JSON.parse(stored);
          // Only clear if category matches (to avoid clearing other categories' data)
          const categoryMatches =
            (!context.category && !category) || context.category === category;
          if (categoryMatches && context.mode === "explore") {
            sessionStorage.removeItem("navigationContext_explore");
          }
        } catch (e) {
          // Invalid stored data, ignore
        }
      }
    }
  }, [itemId, collectionId, category, hasRestoredItems]);

  // Use full list if available (when category/collection is present), otherwise use stored items or fetched items
  const items = collectionId
    ? collectionData?.items ||
      (singleItemData ? [singleItemData] : [])
    : storedItems ||
      data?.items ||
      (singleItemData ? [singleItemData] : []);

  const isLoadingItems = collectionId
    ? collectionLoading
    : isLoading || (itemId ? singleItemLoading : false);

  // Calculate current index based on itemId if present
  useEffect(() => {
    if (itemId && items.length > 0) {
      const index = items.findIndex((item) => item.id === itemId);
      if (index !== -1) {
        setCurrentIndex(index);
      }
    }
  }, [itemId, items]);

  // Use singleItemData for currentItem if available and itemId matches, to ensure we have latest data including collections
  const currentItem = (itemId && singleItemData && singleItemData.id === itemId) 
    ? singleItemData 
    : items[currentIndex];

  useEffect(() => {
    if (items.length > 0 && currentIndex >= items.length) {
      setCurrentIndex(0);
    }
  }, [items.length, currentIndex]);

  // Store items in sessionStorage when we have them (for restoration after comments)
  useEffect(() => {
    if (items.length > 0 && !collectionId) {
      // Store items for both random items and category-based items to restore after comments
      // Don't store for collections as they're stable and can be reloaded
      sessionStorage.setItem(
        "navigationContext_explore",
        JSON.stringify({
          mode: "explore",
          category: category,
          collectionId: collectionId,
          currentIndex: currentIndex,
          itemIds: items.map((item) => item.id),
          items: items, // Store full items data
        })
      );
    }
  }, [items, currentIndex, category, collectionId]);

  // Prepare navigation context for ItemRatingsComments
  // Include context even when itemId is present (e.g., when navigating back from comments)
  const navigationContext =
    items.length > 0
        ? {
            mode: "explore" as const,
            category: category,
            collectionId: collectionId,
            currentIndex: currentIndex,
            itemIds: items.map((item) => item.id),
          }
        : undefined;

  if (isLoadingItems) return <LoadingSpinner />;
  if (error && !collectionId)
    return (
      <ErrorMessage message="Failed to load items" onRetry={() => refetch()} />
    );
  if (items.length === 0) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No items found.</p>
          <Link
            to="/categories"
            className="text-indigo-600 hover:text-indigo-700"
          >
            Go back to categories
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-4xl mx-auto">
        {collectionId && (
          <div className="mb-6 flex items-center space-x-4">
            <button
              onClick={() => navigate("/collections")}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Go Back
            </button>
            {collectionInfo && (
              <h1 className="text-3xl font-bold text-gray-900">
                {collectionInfo.name}
              </h1>
            )}
          </div>
        )}
        {category && !collectionId && (
          <div className="mb-6 flex items-center space-x-4">
            <button
              onClick={() => navigate(returnUrl || "/categories")}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Go Back
            </button>
            <h1 className="text-3xl font-bold text-gray-900">
              {category}
            </h1>
          </div>
        )}
        {!category && !collectionId && (
          <div className="mb-6 flex items-center space-x-4">
            {returnUrl && (
              <button
                onClick={() => navigate(returnUrl)}
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Go Back
              </button>
            )}
          </div>
        )}
        <div className="bg-white shadow rounded-lg p-6 mb-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-2xl font-bold text-gray-900">Explore Mode</h2>
          </div>
          <p className="text-gray-600 text-sm mb-4">
            Study mode for reviewing quiz items. View questions, answers, and explanations. Navigate through items using the arrow buttons or click on related items in comments.
          </p>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    if (currentIndex > 0) {
                      const newIndex = currentIndex - 1;
                      setCurrentIndex(newIndex);
                      // Update URL based on context
                      if (items[newIndex]) {
                        const returnParam = returnUrl ? `?return=${encodeURIComponent(returnUrl)}` : "";
                        if (collectionId) {
                          navigate(
                            `/explore/collection/${collectionId}/item/${items[newIndex].id}${returnParam}`,
                            { replace: true }
                          );
                        } else if (category) {
                          navigate(`/explore/${categoryNameToSlug(category)}/item/${items[newIndex].id}${returnParam}`, { replace: true });
                        } else {
                          navigate(`/explore/item/${items[newIndex].id}${returnParam}`, {
                            replace: true,
                          });
                        }
                      }
                    }
                  }}
                  disabled={currentIndex === 0}
                  className="p-1 text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                  title="Previous item"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <span className="text-sm text-gray-500 min-w-[80px] text-center">
                  {currentIndex + 1} of {items.length}
                </span>
                <button
                  onClick={() => {
                    if (currentIndex < items.length - 1) {
                      const newIndex = currentIndex + 1;
                      setCurrentIndex(newIndex);
                      // Update URL based on context
                      if (items[newIndex]) {
                        const returnParam = returnUrl ? `?return=${encodeURIComponent(returnUrl)}` : "";
                        if (collectionId) {
                          navigate(
                            `/explore/collection/${collectionId}/item/${items[newIndex].id}${returnParam}`,
                            { replace: true }
                          );
                        } else if (category) {
                          navigate(`/explore/${categoryNameToSlug(category)}/item/${items[newIndex].id}${returnParam}`, { replace: true });
                        } else {
                          navigate(`/explore/item/${items[newIndex].id}${returnParam}`, {
                            replace: true,
                          });
                        }
                      }
                    }
                  }}
                  disabled={currentIndex >= items.length - 1}
                  className="p-1 text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                  title="Next item"
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {currentItem && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Question
                </h3>
                <p className="text-gray-700">{currentItem.question}</p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Answer
                </h3>
                <p className="text-gray-700 font-semibold">
                  {currentItem.correctAnswer}
                </p>
              </div>

              {currentItem.explanation && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Explanation
                  </h3>
                  <p className="text-gray-700">{currentItem.explanation}</p>
                </div>
              )}

              <div className="text-sm text-gray-500 space-y-1">
                <div>Category: {currentItem.category}</div>
                {currentItem.source && (
                  <div>Source: {currentItem.source}</div>
                )}
              </div>

              {/* Ratings and Comments */}
              <ItemRatingsComments
                itemId={currentItem.id}
                navigationContext={navigationContext}
              />

              {/* Collection Controls */}
              {(isAuthenticated || (currentItem.collections && currentItem.collections.length > 0)) && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  {isAuthenticated && (
                    <button
                      onClick={() => setSelectedItemForCollections(currentItem.id)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-md"
                      title="Manage collections"
                    >
                      <FolderIcon className="h-5 w-5" />
                    </button>
                  )}
                  {currentItem.collections && currentItem.collections.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {currentItem.collections.map((collection: { id: string; name: string }) => (
                        <button
                          key={collection.id}
                          onClick={() => navigate(`/collections?selected=${collection.id}`)}
                          className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                          title={`Collection: ${collection.name}`}
                        >
                          {collection.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() =>
                setCurrentIndex((prev) => Math.min(items.length - 1, prev + 1))
              }
              disabled={currentIndex === items.length - 1}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>

        {!isAuthenticated && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-yellow-800">
              <Link to="/signup" className="font-medium underline">
                Sign up
              </Link>{" "}
              or{" "}
              <Link to="/login" className="font-medium underline">
                sign in
              </Link>{" "}
              to create your own items and collections!
            </p>
          </div>
        )}

        <div className="text-center">
          <button
            onClick={() => {
              if (collectionId) {
                navigate(`/collections/${collectionId}`);
              } else if (returnUrl) {
                navigate(returnUrl);
              } else {
                navigate("/categories");
              }
            }}
            className="text-indigo-600 hover:text-indigo-700"
          >
            ← Go back
          </button>
        </div>
      </div>

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

export default ExploreModePage;
