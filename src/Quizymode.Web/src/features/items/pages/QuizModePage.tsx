import { useState, useEffect, useMemo } from "react";
import {
  useParams,
  useNavigate,
  useSearchParams,
  Link,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { collectionsApi } from "@/api/collections";
import { categoriesApi } from "@/api/categories";
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
} from "@/utils/categorySlug";
import { ExploreQuizBreadcrumb } from "@/components/ExploreQuizBreadcrumb";

const QuizModePage = () => {
  const { category: categorySlug, collectionId, itemId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnUrl = searchParams.get("return");
  const keywordsParam = searchParams.get("keywords");
  const keywords = keywordsParam
    ? keywordsParam.split(",").map((k) => k.trim()).filter(Boolean)
    : undefined;
  /** Query string for quiz item URLs so keywords (and return) are preserved when using prev/next */
  const quizItemSearch = useMemo(() => {
    const params = new URLSearchParams();
    if (returnUrl) params.set("return", returnUrl);
    if (keywords?.length) params.set("keywords", keywords.join(","));
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [returnUrl, keywords]);
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
      const stored = sessionStorage.getItem("navigationContext_quiz");
      if (stored) {
        try {
          const context = JSON.parse(stored);
          if (context.items && context.mode === "quiz") {
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
    enabled: !!collectionId && isAuthenticated,
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
            // Only restore if category matches (or both are undefined/null)
            const categoryMatches =
              (!context.category && !category) || context.category === category;
            if (categoryMatches) {
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
            `/quiz/collection/${collectionId}/item/${items[newIndex].id}${quizItemSearch}`,
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
            `/quiz/collection/${collectionId}/item/${items[newIndex].id}${quizItemSearch}`,
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

  return (
    <div className="px-4 py-6 sm:px-0">
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
                  mode="quiz"
                  categorySlug={categoryNameToSlug(category)}
                  categoryDisplayName={category}
                  keywords={keywords || []}
                  onNavigate={(path) => navigate(path)}
                />
              </div>
            )}
          </>
        }
        title="Quiz Mode"
        description="Test your knowledge with interactive quizzes. Select an answer to see if you're correct, then view the explanation. Track your score as you progress through items."
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
          ) : category ? (
            <ExploreQuizBreadcrumb
              mode="quiz"
              categorySlug={categoryNameToSlug(category)}
              categoryDisplayName={category}
              keywords={keywords || []}
              onNavigate={(path) => navigate(path)}
            />
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
