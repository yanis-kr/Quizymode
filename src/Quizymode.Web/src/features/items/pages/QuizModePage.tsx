import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { itemsApi } from "@/api/items";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import ItemRatingsComments from "@/components/ItemRatingsComments";
import CollectionControls from "@/components/CollectionControls";

const QuizModePage = () => {
  const { category, collectionId, itemId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [stats, setStats] = useState({ total: 0, correct: 0 });
  const [count] = useState(10);

  // Check sessionStorage for stored items (when navigating back from comments)
  // Must be declared before useQuery that references it
  const [storedItems, setStoredItems] = useState<any[] | null>(null);

  const { data: singleItemData, isLoading: singleItemLoading } = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => itemsApi.getById(itemId!),
    enabled: !!itemId,
  });

  const { data: collectionData, isLoading: collectionLoading } = useQuery({
    queryKey: ["collectionItems", collectionId],
    queryFn: () => collectionsApi.getItems(collectionId!),
    enabled: !!collectionId, // Load even when itemId is present to get full list
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["randomItems", category, count],
    queryFn: () => itemsApi.getRandom(category, undefined, count),
    enabled: !collectionId && !storedItems, // Don't load if we have stored items
  });
  useEffect(() => {
    if (!collectionId && !category) {
      // Restore when we're in quiz mode without category/collection (with or without itemId)
      const stored = sessionStorage.getItem("navigationContext_quiz");
      if (stored) {
        try {
          const context = JSON.parse(stored);
          if (context.items && context.mode === "quiz") {
            setStoredItems(context.items);
            if (itemId) {
              // Find the index of the current itemId in stored items
              const index = context.items.findIndex(
                (item: any) => item.id === itemId
              );
              if (index !== -1) {
                setCurrentIndex(index);
              }
            } else {
              setCurrentIndex(context.currentIndex || 0);
            }
            // Clear sessionStorage after using it
            sessionStorage.removeItem("navigationContext_quiz");
          }
        } catch (e) {
          // Invalid stored data, ignore
        }
      }
    } else {
      // Clear stored items if we have category/collection (they're not needed)
      setStoredItems(null);
    }
  }, [collectionId, category, itemId]);

  // Use full list if available (when category/collection is present), otherwise use single item or stored items
  const items = collectionId
    ? collectionData?.items || (singleItemData ? [singleItemData] : [])
    : storedItems || data?.items || (singleItemData ? [singleItemData] : []);

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

  // Store items in sessionStorage when we have them (for restoration after comments)
  useEffect(() => {
    if (items.length > 0 && !collectionId && !category) {
      // Only store for random items (no category/collection) to restore after comments
      sessionStorage.setItem(
        "navigationContext_quiz",
        JSON.stringify({
          mode: "quiz",
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
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowAnswer(false);
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
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6 mb-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Quiz Mode</h2>
            <div className="text-sm text-gray-500">
              {currentIndex + 1} of {items.length}
            </div>
          </div>

          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">
              Score: {stats.correct} / {stats.total} correct
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
                  Select an answer:
                </h3>
                <div className="space-y-2">
                  {options.map((option, index) => {
                    const letter = String.fromCharCode(65 + index); // A, B, C, D
                    const isCorrect = option === currentItem.correctAnswer;
                    const isSelected = selectedAnswer === option;
                    let bgColor = "bg-white hover:bg-gray-50";
                    if (showAnswer) {
                      if (isCorrect) {
                        bgColor = "bg-green-100 border-green-500";
                      } else if (isSelected && !isCorrect) {
                        bgColor = "bg-red-100 border-red-500";
                      }
                    }

                    return (
                      <button
                        key={index}
                        onClick={() => handleAnswerSelect(option)}
                        disabled={showAnswer}
                        className={`w-full text-left p-4 border-2 rounded-lg ${bgColor} ${
                          showAnswer ? "cursor-default" : "cursor-pointer"
                        }`}
                      >
                        <span className="font-medium">{letter}.</span> {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              {showAnswer && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-900">
                    Correct Answer: {currentItem.correctAnswer}
                  </p>
                  {currentItem.explanation && (
                    <p className="text-sm text-blue-700 mt-2">
                      {currentItem.explanation}
                    </p>
                  )}
                </div>
              )}

              <div className="text-sm text-gray-500">
                Category: {currentItem.category}
                {currentItem.subcategory && ` • ${currentItem.subcategory}`}
              </div>

              {/* Ratings and Comments */}
              {showAnswer && (
                <ItemRatingsComments
                  itemId={currentItem.id}
                  navigationContext={navigationContext}
                />
              )}

              {/* Collection Controls */}
              {showAnswer && <CollectionControls itemId={currentItem.id} />}
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button
              onClick={() => {
                setCurrentIndex((prev) => Math.max(0, prev - 1));
                setSelectedAnswer(null);
                setShowAnswer(false);
              }}
              disabled={currentIndex === 0}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {showAnswer && (
              <button
                onClick={handleNext}
                disabled={currentIndex === items.length - 1}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next Question
              </button>
            )}
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
    </div>
  );
};

export default QuizModePage;
