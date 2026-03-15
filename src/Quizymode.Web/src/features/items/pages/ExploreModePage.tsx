import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { collectionsApi } from "@/api/collections";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { CommentsDrawer } from "@/components/CommentsDrawer";
import { StudyShell } from "@/components/study/StudyShell";
import { ExploreRenderer } from "@/components/study/ExploreRenderer";
import ItemCollectionsModal from "@/components/ItemCollectionsModal";
import { Link } from "react-router-dom";
import {
  categoryNameToSlug,
  findCategoryNameFromSlug,
  buildCategoryPath,
} from "@/utils/categorySlug";
import { ExploreQuizBreadcrumb } from "@/components/ExploreQuizBreadcrumb";
import { ScopeSecondaryBar } from "@/components/ScopeSecondaryBar";

const ExploreModePage = () => {
  const { category: categorySlug, collectionId, itemId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const returnUrl = searchParams.get("return");
  const keywordsParam = searchParams.get("keywords");
  const keywords = keywordsParam
    ? keywordsParam.split(",").map((k) => k.trim()).filter(Boolean)
    : undefined;
  /** Query string for explore item URLs; preserves keywords, return, and scope filter params across prev/next and mode switch */
  const exploreItemSearch = useMemo(() => {
    const params = new URLSearchParams();
    if (returnUrl) params.set("return", returnUrl);
    if (keywords?.length) params.set("keywords", keywords.join(","));
    const filterType = searchParams.get("filterType");
    if (filterType) params.set("filterType", filterType);
    const search = searchParams.get("search");
    if (search) params.set("search", search);
    const ratingMin = searchParams.get("ratingMin");
    if (ratingMin) params.set("ratingMin", ratingMin);
    const ratingMax = searchParams.get("ratingMax");
    if (ratingMax) params.set("ratingMax", ratingMax);
    if (searchParams.get("ratingUnrated") === "1") params.set("ratingUnrated", "1");
    if (searchParams.get("ratingOnlyUnrated") === "1") params.set("ratingOnlyUnrated", "1");
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [returnUrl, keywords, searchParams]);
  /** Explore loads all available items (backend max 1000) into memory */
  const EXPLORE_MAX_ITEMS = 1000;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedItemForCollections, setSelectedItemForCollections] = useState<
    string | null
  >(null);
  const [commentsDrawerItemId, setCommentsDrawerItemId] = useState<string | null>(
    null
  );
  const hasSyncedInitialItemUrl = useRef(false);

  // Fetch categories to convert slug to actual category name
  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: !!categorySlug && !collectionId,
  });

  // Convert category slug to actual category name
  // Returns undefined while categories are loading to prevent API calls with invalid slug
  const category = useMemo(() => {
    if (!categorySlug) return undefined;
    if (!categoriesData?.categories) return undefined; // Wait for categories to load
    const categoryNames = categoriesData.categories.map((c) => c.category);
    const actualCategoryName = findCategoryNameFromSlug(
      categorySlug,
      categoryNames,
    );
    return actualCategoryName || categorySlug; // Fallback to slug if not found in list
  }, [categorySlug, categoriesData?.categories]);

  // Track whether we're still resolving the category name from slug
  const isCategoryResolving = !!categorySlug && !categoriesData?.categories;

  // Fetch navigation keyword descriptions for breadcrumb tooltips
  const { data: keywordDescriptionsData } = useQuery({
    queryKey: ["keyword-descriptions", category, keywords],
    queryFn: () =>
      keywordsApi.getKeywordDescriptions(category!, keywords ?? []),
    enabled: !!category && (keywords?.length ?? 0) > 0,
  });
  const keywordDescriptions =
    keywordDescriptionsData?.keywords?.map((k) => k.description) ?? undefined;

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
            // Restore if we navigated here with this list (itemId in stored items) or category matches
            const itemInStoredList = context.items.some(
              (item: { id?: string }) => item.id === itemId
            );
            const categoryMatches =
              (!context.category && !category) ||
              context.category === category ||
              !category;
            if (itemInStoredList || categoryMatches) {
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
    enabled: !!collectionId,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["randomItems", category, EXPLORE_MAX_ITEMS, keywords],
    queryFn: () => itemsApi.getRandom(category, EXPLORE_MAX_ITEMS, keywords),
    enabled: !collectionId && !storedItems && !isCategoryResolving, // Don't load if we have stored items or category is still resolving
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
              const itemInStoredList = context.items.some(
                (item: { id?: string }) => item.id === itemId
              );
              const categoryMatches =
                (!context.category && !category) ||
                context.category === category ||
                !category;
              if (itemInStoredList || categoryMatches) {
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
    : isCategoryResolving || isLoading || (itemId ? singleItemLoading : false);

  // Calculate current index based on itemId if present
  useEffect(() => {
    if (itemId && items.length > 0) {
      const index = items.findIndex((item) => item.id === itemId);
      if (index !== -1) {
        setCurrentIndex(index);
      }
    }
  }, [itemId, items]);

  // Sync URL to include first item id when landing on explore without item in path (e.g. /explore/certs?keywords=...)
  useEffect(() => {
    if (
      !itemId &&
      items.length > 0 &&
      currentIndex === 0 &&
      !hasSyncedInitialItemUrl.current
    ) {
      hasSyncedInitialItemUrl.current = true;
      const firstId = items[0].id;
      if (collectionId) {
        navigate(
          `/explore/collection/${collectionId}/item/${firstId}${exploreItemSearch}`,
          { replace: true }
        );
      } else if (category) {
        navigate(
          `/explore/${categoryNameToSlug(category)}/item/${firstId}${exploreItemSearch}`,
          { replace: true }
        );
      } else {
        navigate(`/explore/item/${firstId}${exploreItemSearch}`, {
          replace: true,
        });
      }
    }
  }, [
    itemId,
    items,
    currentIndex,
    collectionId,
    category,
    exploreItemSearch,
    navigate,
  ]);

  // In list view (no itemId in URL), subscribe to current item so +/− invalidation triggers re-render and UI updates
  const currentListItem = items[currentIndex];
  const currentItemIdForQuery = currentListItem?.id;
  const { data: currentItemData } = useQuery({
    queryKey: ["item", currentItemIdForQuery],
    queryFn: () => itemsApi.getById(currentItemIdForQuery!),
    enabled: !!currentItemIdForQuery && !itemId && items.length > 0,
  });
  const currentItem = (itemId && singleItemData && singleItemData.id === itemId)
    ? singleItemData
    : (currentItemData?.id === currentListItem?.id ? currentItemData : currentListItem);

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

  const handlePrev = () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      if (items[newIndex]) {
        if (collectionId) {
          navigate(
            `/explore/collection/${collectionId}/item/${items[newIndex].id}${exploreItemSearch}`,
            { replace: true }
          );
        } else if (category) {
          navigate(`/explore/${categoryNameToSlug(category)}/item/${items[newIndex].id}${exploreItemSearch}`, { replace: true });
        } else {
          navigate(`/explore/item/${items[newIndex].id}${exploreItemSearch}`, { replace: true });
        }
      }
    }
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      if (items[newIndex]) {
        if (collectionId) {
          navigate(
            `/explore/collection/${collectionId}/item/${items[newIndex].id}${exploreItemSearch}`,
            { replace: true }
          );
        } else if (category) {
          navigate(`/explore/${categoryNameToSlug(category)}/item/${items[newIndex].id}${exploreItemSearch}`, { replace: true });
        } else {
          navigate(`/explore/item/${items[newIndex].id}${exploreItemSearch}`, { replace: true });
        }
      }
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <ScopeSecondaryBar
        scopeType={collectionId ? "collection" : "category"}
        activeMode="explore"
        availableModes={["list", "explore", "quiz"]}
        onModeChange={(mode) => {
          const search = exploreItemSearch;
          if (mode === "list") {
            if (collectionId) navigate(`/collections/${collectionId}`);
            else if (category)
              navigate(
                `${buildCategoryPath(categoryNameToSlug(category), keywords || [])}?view=items`
              );
            else navigate("/categories");
          } else if (mode === "quiz") {
            const targetItemId = currentItem?.id ?? items[0]?.id;
            if (items.length > 0 && targetItemId) {
              const payload = {
                mode: "quiz" as const,
                category: category,
                items: items,
                currentIndex: currentIndex,
              };
              sessionStorage.setItem("navigationContext_quiz", JSON.stringify(payload));
              sessionStorage.setItem("quiz_scope_items_from_categories", JSON.stringify(payload));
            }
            if (collectionId)
              navigate(
                `/quiz/collection/${collectionId}/item/${currentItem?.id ?? items[0]?.id}${search}`
              );
            else if (category)
              navigate(
                `/quiz/${categoryNameToSlug(category)}/item/${currentItem?.id ?? items[0]?.id}${search}`
              );
            else if (items[0])
              navigate(`/quiz/item/${currentItem?.id ?? items[0].id}${search}`);
          }
        }}
      />
      <StudyShell
        backContent={
          <>
            {collectionId && (
              <div className="mb-6 flex items-center space-x-4">
                <button
                  onClick={() => navigate("/collections")}
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  ← Go Back
                </button>
                {collectionInfo && (
                  <h1 className="text-3xl font-bold text-gray-900">
                    {collectionInfo.name}
                  </h1>
                )}
              </div>
            )}
            {category && !collectionId && (
              <div className="mb-6">
                <ExploreQuizBreadcrumb
                  mode="explore"
                  categorySlug={categoryNameToSlug(category)}
                  categoryDisplayName={category}
                  keywords={keywords || []}
                  keywordDescriptions={keywordDescriptions}
                  onNavigate={(path) => navigate(path)}
                />
              </div>
            )}
            {!category && !collectionId && returnUrl && (
              <div className="mb-6">
                <nav className="flex items-center gap-1 text-sm text-gray-600">
                  <button
                    onClick={() => navigate(returnUrl)}
                    className="text-indigo-600 hover:text-indigo-800"
                    type="button"
                  >
                    ← Back
                  </button>
                </nav>
              </div>
            )}
          </>
        }
        title="Explore Mode"
        description="Study mode for reviewing quiz items. View questions, answers, and explanations. Navigate through items using the arrow buttons or click on related items in comments."
        currentIndex={currentIndex}
        totalCount={items.length}
        onPrev={handlePrev}
        onNext={handleNext}
        isPrevDisabled={currentIndex === 0}
        isNextDisabled={currentIndex >= items.length - 1}
        currentItem={currentItem ?? undefined}
        navigationContext={navigationContext}
        onOpenComments={(id) => setCommentsDrawerItemId(id)}
        onOpenManageCollections={(id) => setSelectedItemForCollections(id)}
        isAuthenticated={isAuthenticated}
        signUpPrompt={
          !isAuthenticated ? (
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
          ) : undefined
        }
        footerContent={
          collectionId ? (
            <button
              onClick={() => navigate(`/collections/${collectionId}`)}
              className="text-indigo-600 hover:text-indigo-700"
              type="button"
            >
              ← Back to collection
            </button>
          ) : category ? (
            <ExploreQuizBreadcrumb
              mode="explore"
              categorySlug={categoryNameToSlug(category)}
              categoryDisplayName={category}
              keywords={keywords || []}
              keywordDescriptions={keywordDescriptions}
              onNavigate={(path) => navigate(path)}
            />
          ) : returnUrl ? (
            <button
              onClick={() => navigate(returnUrl)}
              className="text-indigo-600 hover:text-indigo-700"
              type="button"
            >
              ← Back
            </button>
          ) : (
            <Link to="/categories" className="text-indigo-600 hover:text-indigo-700">
              ← Categories
            </Link>
          )
        }
      >
        {currentItem && <ExploreRenderer item={currentItem} />}
      </StudyShell>

      <CommentsDrawer
        itemId={commentsDrawerItemId}
        onClose={() => setCommentsDrawerItemId(null)}
        onNavigateToItem={(targetId) => {
          const idx = items.findIndex((i) => i.id === targetId);
          if (idx !== -1) {
            setCurrentIndex(idx);
            setCommentsDrawerItemId(targetId);
          }
        }}
        previousItemId={
          commentsDrawerItemId
            ? (() => {
                const idx = items.findIndex((i) => i.id === commentsDrawerItemId);
                return idx > 0 ? items[idx - 1]?.id ?? null : null;
              })()
            : null
        }
        nextItemId={
          commentsDrawerItemId
            ? (() => {
                const idx = items.findIndex((i) => i.id === commentsDrawerItemId);
                return idx >= 0 && idx < items.length - 1
                  ? items[idx + 1]?.id ?? null
                  : null;
              })()
            : null
        }
      />
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
