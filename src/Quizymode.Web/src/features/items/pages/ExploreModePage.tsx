import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import ItemRatingsComments from "@/components/ItemRatingsComments";
import ItemCollectionsModal from "@/components/ItemCollectionsModal";
import { Link } from "react-router-dom";
import {
  FolderIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

const ExploreModePage = () => {
  const { category, collectionId, itemId } = useParams();
  const [searchParams] = useSearchParams();
  const subcategory = searchParams.get("subcategory") || undefined;
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [count] = useState(100); // Increased default to fetch more items
  const [selectedItemForCollections, setSelectedItemForCollections] = useState<
    string | null
  >(null);

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
            // Only restore if category and subcategory match (or both are undefined/null)
            const categoryMatches =
              (!context.category && !category) || context.category === category;
            const subcategoryMatches =
              (!context.subcategory && !subcategory) || context.subcategory === subcategory;
            if (categoryMatches && subcategoryMatches) {
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
    enabled: !!itemId && !storedItems, // Disable when restoring from sessionStorage
  });

  const { data: collectionData, isLoading: collectionLoading } = useQuery({
    queryKey: ["collectionItems", collectionId],
    queryFn: () => collectionsApi.getItems(collectionId!),
    enabled: !!collectionId, // Load even when itemId is present to get full list
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["randomItems", category, subcategory, count],
    queryFn: () => itemsApi.getRandom(category, subcategory, count),
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
            // Only restore if category and subcategory match (or both are undefined/null)
            const categoryMatches =
              (!context.category && !category) || context.category === category;
            const subcategoryMatches =
              (!context.subcategory && !subcategory) || context.subcategory === subcategory;
            if (categoryMatches && subcategoryMatches) {
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
  }, [itemId, hasRestoredItems, category, subcategory, collectionId]);

  // Clear sessionStorage when starting a fresh explore (no itemId, no collectionId)
  // This ensures we always fetch fresh items instead of restoring old ones
  useEffect(() => {
    if (!itemId && !collectionId && !hasRestoredItems) {
      // Clear old sessionStorage for this category when starting fresh
      const stored = sessionStorage.getItem("navigationContext_explore");
      if (stored) {
        try {
          const context = JSON.parse(stored);
          // Only clear if category and subcategory match (to avoid clearing other categories' data)
          const categoryMatches =
            (!context.category && !category) || context.category === category;
          const subcategoryMatches =
            (!context.subcategory && !subcategory) || context.subcategory === subcategory;
          if (categoryMatches && subcategoryMatches && context.mode === "explore") {
            sessionStorage.removeItem("navigationContext_explore");
          }
        } catch (e) {
          // Invalid stored data, ignore
        }
      }
    }
  }, [itemId, collectionId, category, subcategory, hasRestoredItems]);

  // Use full list if available (when category/collection is present), otherwise use stored items or fetched items
  // Never use singleItemData when storedItems exists (restoring from sessionStorage)
  const items = collectionId
    ? collectionData?.items ||
      (singleItemData && !storedItems ? [singleItemData] : [])
    : storedItems ||
      data?.items ||
      (singleItemData && !storedItems ? [singleItemData] : []);

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

  const currentItem = items[currentIndex];

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
          subcategory: subcategory,
          collectionId: collectionId,
          currentIndex: currentIndex,
          itemIds: items.map((item) => item.id),
          items: items, // Store full items data
        })
      );
    }
  }, [items, currentIndex, category, subcategory, collectionId]);

  // Prepare navigation context for ItemRatingsComments
  // Include context even when itemId is present (e.g., when navigating back from comments)
  const navigationContext =
    items.length > 0
        ? {
            mode: "explore" as const,
            category: category,
            subcategory: subcategory,
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
        <div className="bg-white shadow rounded-lg p-6 mb-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Explore Mode</h2>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    if (currentIndex > 0) {
                      const newIndex = currentIndex - 1;
                      setCurrentIndex(newIndex);
                      // Update URL based on context
                      if (items[newIndex]) {
                        if (collectionId) {
                          navigate(
                            `/explore/collection/${collectionId}/item/${items[newIndex].id}`,
                            { replace: true }
                          );
                        } else if (category) {
                          const params = new URLSearchParams();
                          if (subcategory) params.set("subcategory", subcategory);
                          const queryString = params.toString();
                          const url = queryString
                            ? `/explore/${encodeURIComponent(category)}/item/${items[newIndex].id}?${queryString}`
                            : `/explore/${encodeURIComponent(category)}/item/${items[newIndex].id}`;
                          navigate(url, { replace: true });
                        } else {
                          navigate(`/explore/item/${items[newIndex].id}`, {
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
                        if (collectionId) {
                          navigate(
                            `/explore/collection/${collectionId}/item/${items[newIndex].id}`,
                            { replace: true }
                          );
                        } else if (category) {
                          const params = new URLSearchParams();
                          if (subcategory) params.set("subcategory", subcategory);
                          const queryString = params.toString();
                          const url = queryString
                            ? `/explore/${encodeURIComponent(category)}/item/${items[newIndex].id}?${queryString}`
                            : `/explore/${encodeURIComponent(category)}/item/${items[newIndex].id}`;
                          navigate(url, { replace: true });
                        } else {
                          navigate(`/explore/item/${items[newIndex].id}`, {
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

              <div className="text-sm text-gray-500">
                Category: {currentItem.category}
                {currentItem.subcategory && ` • ${currentItem.subcategory}`}
              </div>

              {/* Ratings and Comments */}
              <ItemRatingsComments
                itemId={currentItem.id}
                navigationContext={navigationContext}
              />

              {/* Collection Controls */}
              {isAuthenticated && (
                <div className="mt-4">
                  <button
                    onClick={() => setSelectedItemForCollections(currentItem.id)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-md"
                    title="Manage collections"
                  >
                    <FolderIcon className="h-5 w-5" />
                  </button>
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
          <Link
            to={
              category
                ? `/items?category=${encodeURIComponent(category)}`
                : "/categories"
            }
            className="text-indigo-600 hover:text-indigo-700"
          >
            ← Back to items
          </Link>
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
