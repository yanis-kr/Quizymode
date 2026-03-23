import { useState, useEffect, useMemo, useRef } from "react";
import {
  useParams,
  useNavigate,
  useSearchParams,
  Link,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { collectionsApi } from "@/api/collections";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { CommentsDrawer } from "@/components/CommentsDrawer";
import { StudyShell } from "@/components/study/StudyShell";
import { QuizRenderer } from "@/components/study/QuizRenderer";
import ItemCollectionsModal from "@/components/ItemCollectionsModal";
import {
  categoryNameToSlug,
  findCategoryNameFromSlug,
  buildCategoryPath,
} from "@/utils/categorySlug";
import { ExploreQuizBreadcrumb } from "@/components/ExploreQuizBreadcrumb";
import { ScopeSecondaryBar } from "@/components/ScopeSecondaryBar";
import { ScopePathHeader } from "@/components/ScopePathHeader";
import type { ViewMode } from "@/components/ModeSwitcher";
import { StarIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import type { CollectionRatingResponse } from "@/types/api";
import { getCategoryScopeModeConfig } from "@/features/categories/utils/categoryScopeMode";
import { getStudyScopeKeywords } from "@/features/items/utils/studyScopeParams";

const QuizModePage = () => {
  const { category: categorySlug, collectionId, itemId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const returnUrl = searchParams.get("return");
  const hasCategoryScope = !!categorySlug && !collectionId;
  const hasExplicitNavParam = searchParams.has("nav");
  const { keywords, navigationKeywords, filterKeywords } = useMemo(
    () => getStudyScopeKeywords(searchParams, hasCategoryScope),
    [searchParams, hasCategoryScope]
  );
  /** Query string for quiz item URLs; preserves keywords, return, and scope filter params across prev/next and mode switch */
  const quizItemSearch = useMemo(() => {
    const params = new URLSearchParams();
    if (returnUrl) params.set("return", returnUrl);
    if (hasCategoryScope && (hasExplicitNavParam || navigationKeywords.length > 0)) {
      params.set("nav", navigationKeywords.join(","));
    }
    if (keywords.length > 0) params.set("keywords", keywords.join(","));
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
  }, [
    hasCategoryScope,
    hasExplicitNavParam,
    navigationKeywords,
    returnUrl,
    keywords,
    searchParams,
  ]);
  const { isAuthenticated } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [stats, setStats] = useState({ total: 0, correct: 0 });
  /** Quiz uses random N items (default 10); changing this refetches items */
  const [quizSize, setQuizSize] = useState(10);
  const [selectedItemForCollections, setSelectedItemForCollections] = useState<
    string | null
  >(null);
  const [commentsDrawerItemId, setCommentsDrawerItemId] = useState<string | null>(
    null
  );
  const [showDetails, setShowDetails] = useState(false);
  const hasSyncedInitialItemUrl = useRef(false);

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

  // Fetch navigation keyword descriptions for breadcrumb tooltips
  const { data: keywordDescriptionsData } = useQuery({
    queryKey: ["keyword-descriptions", category, navigationKeywords],
    queryFn: () =>
      keywordsApi.getKeywordDescriptions(category!, navigationKeywords),
    enabled: !!category && navigationKeywords.length > 0,
  });
  const keywordDescriptions =
    keywordDescriptionsData?.keywords?.map((k) => k.description) ?? undefined;

  // Check sessionStorage for stored items (when navigating with itemId from ItemsPage or comments)
  // Must be declared before useQuery that references it
  // Initialize synchronously from sessionStorage to avoid race conditions
  // Prefer dedicated key from Categories list (filtered scope) so we use it before any overwrite
  const getStoredItems = (): any[] | null => {
    if (!collectionId && itemId) {
      const fromCategories = sessionStorage.getItem(
        "quiz_scope_items_from_categories"
      );
      if (fromCategories) {
        try {
          const context = JSON.parse(fromCategories);
          if (
            context.items &&
            Array.isArray(context.items) &&
            context.items.some((item: { id?: string }) => item.id === itemId)
          ) {
            sessionStorage.removeItem("quiz_scope_items_from_categories");
            return context.items;
          }
        } catch (e) {
          sessionStorage.removeItem("quiz_scope_items_from_categories");
        }
      }
      const stored = sessionStorage.getItem("navigationContext_quiz");
      if (stored) {
        try {
          const context = JSON.parse(stored);
          if (context.items && context.mode === "quiz") {
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
    enabled: !!itemId && !storedItems, // Disable when restoring from sessionStorage
  });

  const { data: collectionData, isLoading: collectionLoading } = useQuery({
    queryKey: ["collectionItems", collectionId],
    queryFn: () => collectionsApi.getItems(collectionId!),
    enabled: !!collectionId, // Load even when itemId is present to get full list
  });

  const { data: collectionInfo } = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: () => collectionsApi.getById(collectionId!),
    enabled: !!collectionId, // Allow anonymous: shareable link shows collection name and items
  });

  const { data: ratingData } = useQuery<CollectionRatingResponse>({
    queryKey: ["collectionRating", collectionId],
    queryFn: () => collectionsApi.getRating(collectionId!),
    enabled: !!collectionId,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["randomItems", category, quizSize, keywords],
    queryFn: () => itemsApi.getRandom(category, quizSize, keywords),
    // When URL has a category slug, wait for categories so we send resolved name; otherwise API can resolve by slug.
    enabled:
      !collectionId &&
      !storedItems &&
      (!categorySlug || !!categoriesData?.categories),
  });

  // Restore items, index, and quiz state from sessionStorage on mount
  // Restore when navigating to a specific item (itemId present)
  useEffect(() => {
    if (!hasRestoredItems && !collectionId && itemId && storedItems) {
      const stored = sessionStorage.getItem("navigationContext_quiz");
      if (stored) {
        try {
          const context = JSON.parse(stored);
          if (
            context.items &&
            context.mode === "quiz" &&
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

              // Find the index of the current itemId in stored items, or use stored currentIndex
              if (itemId) {
                const index = context.items.findIndex(
                  (item: any) => item.id === itemId
                );
                if (index !== -1) {
                  setCurrentIndex(index);
                  // Restore quiz state for this specific item if available
                  if (context.quizState && context.quizState[index]) {
                    const itemState = context.quizState[index];
                    setSelectedAnswer(itemState.selectedAnswer || null);
                    setShowAnswer(itemState.showAnswer || false);
                  }
                } else if (context.currentIndex !== undefined) {
                  // If itemId not found but we have a stored index, use it
                  setCurrentIndex(context.currentIndex);
                }
              } else {
                setCurrentIndex(context.currentIndex || 0);
                // Restore quiz state for current index if available
                if (
                  context.quizState &&
                  context.quizState[context.currentIndex || 0]
                ) {
                  const itemState =
                    context.quizState[context.currentIndex || 0];
                  setSelectedAnswer(itemState.selectedAnswer || null);
                  setShowAnswer(itemState.showAnswer || false);
                }
              }

              // Restore stats if available
              if (context.stats) {
                setStats(context.stats);
              }

              // Don't clear sessionStorage - keep it so quiz state persists for future navigation
              // The storage useEffect will update it as state changes
              setHasRestoredItems(true);
            }
          }
        } catch (e) {
          // Invalid stored data, ignore
        }
      }
    }
  }, [itemId, hasRestoredItems, category, collectionId]);

  // Clear sessionStorage when starting a fresh quiz (no itemId, no collectionId)
  // This ensures we always fetch fresh items instead of restoring old ones
  useEffect(() => {
    if (!itemId && !collectionId && !hasRestoredItems) {
      // Clear old sessionStorage for this category when starting fresh
      const stored = sessionStorage.getItem("navigationContext_quiz");
      if (stored) {
        try {
          const context = JSON.parse(stored);
          // Only clear if category matches (to avoid clearing other categories' data)
          const categoryMatches =
            (!context.category && !category) || context.category === category;
          if (
            categoryMatches &&
            context.mode === "quiz"
          ) {
            sessionStorage.removeItem("navigationContext_quiz");
          }
        } catch (e) {
          // Invalid stored data, ignore
        }
      }
    }
  }, [itemId, collectionId, category, hasRestoredItems]);

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

  // Sync URL to include first item id when landing on quiz without item in path (e.g. /quiz/certs?keywords=...)
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
          `/quiz/collections/${collectionId}/item/${firstId}${quizItemSearch}`,
          { replace: true }
        );
      } else if (category) {
        navigate(
          `/quiz/${categoryNameToSlug(category)}/item/${firstId}${quizItemSearch}`,
          { replace: true }
        );
      } else {
        navigate(`/quiz/item/${firstId}${quizItemSearch}`, {
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
    quizItemSearch,
    navigate,
  ]);

  const currentItem = items[currentIndex];

  useEffect(() => {
    if (items.length > 0 && currentIndex >= items.length) {
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setShowAnswer(false);
    }
  }, [items.length, currentIndex]);

  // Store items and quiz state in sessionStorage when we have them (for restoration after comments)
  useEffect(() => {
    if (items.length > 0 && !collectionId) {
      // Load existing quiz state from sessionStorage to preserve state for all items
      let existingQuizState: Record<
        number,
        { selectedAnswer: string | null; showAnswer: boolean }
      > = {};
      try {
        const stored = sessionStorage.getItem("navigationContext_quiz");
        if (stored) {
          const context = JSON.parse(stored);
          // Only load existing state if category matches (to avoid mixing states from different sessions)
          const categoryMatches =
            (!context.category && !category) || context.category === category;
          if (categoryMatches && context.quizState) {
            existingQuizState = context.quizState;
          }
        }
      } catch (e) {
        // Ignore errors
      }

      // Update current item's state
      existingQuizState[currentIndex] = {
        selectedAnswer: selectedAnswer,
        showAnswer: showAnswer,
      };

      // Store items for both random items and category-based items to restore after comments
      // Don't store for collections as they're stable and can be reloaded
      sessionStorage.setItem(
        "navigationContext_quiz",
        JSON.stringify({
          mode: "quiz",
          category: category,
          collectionId: collectionId,
          currentIndex: currentIndex,
          itemIds: items.map((item) => item.id),
          items: items, // Store full items data
          stats: stats, // Store quiz stats
          quizState: existingQuizState, // Store quiz state for all items
        })
      );
    }
  }, [
    items,
    currentIndex,
    category,
    collectionId,
    selectedAnswer,
    showAnswer,
    stats,
  ]);

  // Prepare navigation context for ItemRatingsComments
  // Include context even when itemId is present (e.g., when navigating back from comments)
  const navigationContext =
    items.length > 0
      ? {
          mode: "quiz" as const,
          category: category,
          collectionId: collectionId,
          currentIndex: currentIndex,
          itemIds: items.map((item) => item.id),
        }
      : undefined;

  const getShuffledOptions = () => {
    if (!currentItem) return [];
    const options = [
      currentItem.correctAnswer,
      ...currentItem.incorrectAnswers.slice(0, 3),
    ];
    return options.sort(() => Math.random() - 0.5);
  };

  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    if (currentItem) {
      setOptions(getShuffledOptions());
    }
  }, [currentItem]);

  const handleAnswerSelect = (answer: string) => {
    if (showAnswer) return;
    setSelectedAnswer(answer);
    setShowAnswer(true);
    setStats((prev) => ({
      total: prev.total + 1,
      correct: prev.correct + (answer === currentItem?.correctAnswer ? 1 : 0),
    }));
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      setSelectedAnswer(null);
      setShowAnswer(false);
      if (items[newIndex]) {
        if (collectionId) {
          navigate(
            `/quiz/collections/${collectionId}/item/${items[newIndex].id}${quizItemSearch}`,
            { replace: true }
          );
        } else if (category) {
          navigate(`/quiz/${categoryNameToSlug(category)}/item/${items[newIndex].id}${quizItemSearch}`, { replace: true });
        } else {
          navigate(`/quiz/item/${items[newIndex].id}${quizItemSearch}`, { replace: true });
        }
      }
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      setSelectedAnswer(null);
      setShowAnswer(false);
      if (items[newIndex]) {
        if (collectionId) {
          navigate(
            `/quiz/collections/${collectionId}/item/${items[newIndex].id}${quizItemSearch}`,
            { replace: true }
          );
        } else if (category) {
          navigate(`/quiz/${categoryNameToSlug(category)}/item/${items[newIndex].id}${quizItemSearch}`, { replace: true });
        } else {
          navigate(`/quiz/item/${items[newIndex].id}${quizItemSearch}`, { replace: true });
        }
      }
    }
  };

  const handleCollectionChange = (
    changedItemId: string,
    _updatedCollectionIds: Set<string>,
    payload: { added?: { id: string; name: string }; removedId?: string }
  ) => {
    const applyPayload = (collections: { id: string; name: string; createdAt?: string }[] = []) => {
      if (payload.added) {
        return [
          ...collections.filter((c) => c.id !== payload.added!.id),
          {
            id: payload.added.id,
            name: payload.added.name,
            createdAt: new Date().toISOString(),
          },
        ];
      }
      if (payload.removedId) {
        return collections.filter((c) => c.id !== payload.removedId);
      }
      return collections;
    };

    if (collectionId) {
      queryClient.invalidateQueries({ queryKey: ["collectionItems", collectionId] });
      return;
    }
    if (storedItems) {
      setStoredItems((prev) =>
        prev
          ? prev.map((item) =>
              item.id === changedItemId
                ? { ...item, collections: applyPayload(item.collections ?? []) }
                : item
            )
          : prev
      );
      return;
    }
    queryClient.setQueryData(
      ["randomItems", category, quizSize, keywords],
      (old: { items?: { id: string; collections?: { id: string; name: string; createdAt?: string }[] }[] } | undefined) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((item) =>
            item.id === changedItemId
              ? { ...item, collections: applyPayload(item.collections ?? []) }
              : item
          ),
        };
      }
    );
  };

  if (isLoadingItems) return <LoadingSpinner />;
  if (error && !collectionId && !itemId)
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

  const hideSetsMode = !!category && navigationKeywords.length >= 2;
  const categoryAvailableModes: ViewMode[] = collectionId
    ? ["list", "explore", "quiz"]
    : getCategoryScopeModeConfig("sets", hideSetsMode).availableModes;
  const categoryScopePath = category
    ? buildCategoryPath(categoryNameToSlug(category), navigationKeywords)
    : "/categories";
  const categoryListSearch = (() => {
    const params = new URLSearchParams();
    params.set("view", "items");
    if (filterKeywords.length > 0) {
      params.set("keywords", filterKeywords.join(","));
    }
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
    const query = params.toString();
    return query ? `?${query}` : "";
  })();

  return (
    <div className="px-4 py-6 sm:px-0">
      <ScopeSecondaryBar
        scopeType={collectionId ? "collection" : "category"}
        activeMode="quiz"
        availableModes={categoryAvailableModes}
        onModeChange={(mode) => {
          const search = quizItemSearch;
          if (mode === "sets") {
            if (category) navigate(categoryScopePath);
            else navigate("/categories");
          } else if (mode === "list") {
            if (collectionId) navigate(`/collections/${collectionId}`);
            else if (category)
              navigate(`${categoryScopePath}${categoryListSearch}`);
            else navigate("/categories");
          } else if (mode === "explore") {
            const targetItemId = currentItem?.id ?? items[0]?.id;
            if (items.length > 0 && targetItemId) {
              sessionStorage.setItem(
                "navigationContext_explore",
                JSON.stringify({
                  mode: "explore",
                  category: category,
                  items: items,
                  currentIndex: currentIndex,
                })
              );
            }
            if (collectionId)
              navigate(
                `/explore/collections/${collectionId}/item/${currentItem?.id ?? items[0]?.id}${search}`
              );
            else if (category)
              navigate(
                `/explore/${categoryNameToSlug(category)}/item/${currentItem?.id ?? items[0]?.id}${search}`
              );
            else if (items[0])
              navigate(`/explore/item/${currentItem?.id ?? items[0].id}${search}`);
          }
        }}
      />
      {collectionId && collectionInfo && (
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4 mb-4">
          <div className="min-w-0">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Collection
            </div>
            <div className="flex flex-wrap items-baseline gap-2">
              <div className="text-lg font-semibold text-gray-900 truncate max-w-xs sm:max-w-sm md:max-w-md">
                {collectionInfo.name}
              </div>
              {collectionInfo.description && collectionInfo.description.trim() !== "" && (
                <div className="text-sm text-gray-500 truncate max-w-xs sm:max-w-sm md:max-w-lg">
                  {collectionInfo.description}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-sm text-gray-600">
              {collectionInfo.itemCount ?? items.length} items
            </div>
            {ratingData && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Rating</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} className="p-0.5">
                      {ratingData.averageStars != null && star <= Math.round(ratingData.averageStars) ? (
                        <StarIconSolid className="h-4 w-4 text-amber-500" />
                      ) : (
                        <StarIcon className="h-4 w-4 text-gray-300" />
                      )}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-gray-500">
                  {ratingData.averageStars != null
                    ? `${ratingData.averageStars} (${ratingData.count})`
                    : "No ratings yet"}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Details
            </button>
          </div>
        </div>
      )}
      {category && !collectionId && (
        <ScopePathHeader
          breadcrumb={
            <ExploreQuizBreadcrumb
              mode="quiz"
              categorySlug={categoryNameToSlug(category)}
              categoryDisplayName={category}
              keywords={navigationKeywords}
              keywordDescriptions={keywordDescriptions}
              onNavigate={(path) => navigate(path)}
            />
          }
          count={items.length}
          hint="Test your knowledge with interactive quizzes."
        />
      )}
      {showDetails && collectionId && collectionInfo && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-40"
          onClick={() => setShowDetails(false)}
        >
          <div
            className="relative top-24 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Collection details</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <dl className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-gray-600">Name</dt>
                <dd className="text-right break-words">{collectionInfo.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-gray-600">Author</dt>
                <dd className="text-right break-all">{collectionInfo.createdBy}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-gray-600">Created</dt>
                <dd className="text-right">
                  {new Date(collectionInfo.createdAt).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-gray-600">Items</dt>
                <dd className="text-right">{collectionInfo.itemCount}</dd>
              </div>
              {"isPublic" in collectionInfo && (
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-gray-600">Visibility</dt>
                  <dd className="text-right">
                    {collectionInfo.isPublic ? "Public" : "Private"}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
      <StudyShell
        backContent={
          <>
          </>
        }
        description={
          !category || !!collectionId
            ? "Test your knowledge with interactive quizzes."
            : undefined
        }
        headerExtra={
          !collectionId ? (
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <span>Quiz size:</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={quizSize}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isNaN(n)) setQuizSize(Math.min(1000, Math.max(1, n)));
                  }}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
                <span className="text-gray-500">items (change refetches)</span>
              </label>
            </div>
          ) : undefined
        }
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
        onCollectionChange={handleCollectionChange}
        isAuthenticated={isAuthenticated}
        showRatingsAndCollections={showAnswer}
        footerContent={
          collectionId ? (
            <button
              onClick={() => navigate(`/collections/${collectionId}`)}
              className="text-indigo-600 hover:text-indigo-700"
              type="button"
            >
              ← Back to collection
            </button>
          ) : (
            <Link to="/categories" className="text-indigo-600 hover:text-indigo-700">
              ← Categories
            </Link>
          )
        }
      >
        {currentItem && (
          <QuizRenderer
            item={currentItem}
            options={options}
            selectedAnswer={selectedAnswer}
            showAnswer={showAnswer}
            onAnswerSelect={handleAnswerSelect}
            stats={stats}
          />
        )}
      </StudyShell>

      <CommentsDrawer
        itemId={commentsDrawerItemId}
        onClose={() => setCommentsDrawerItemId(null)}
        onNavigateToItem={(targetId) => {
          const idx = items.findIndex((i) => i.id === targetId);
          if (idx !== -1) {
            setCurrentIndex(idx);
            setCommentsDrawerItemId(targetId);
            setSelectedAnswer(null);
            setShowAnswer(false);
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

export default QuizModePage;
