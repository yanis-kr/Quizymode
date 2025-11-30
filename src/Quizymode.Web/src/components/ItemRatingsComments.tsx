import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ratingsApi } from "@/api/ratings";
import { commentsApi } from "@/api/comments";
import { useAuth } from "@/contexts/AuthContext";
import { StarIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

interface ItemRatingsCommentsProps {
  itemId: string;
  navigationContext?: {
    mode: "explore" | "quiz";
    category?: string;
    collectionId?: string;
    currentIndex: number;
    itemIds: string[];
  };
}

const ItemRatingsComments = ({
  itemId,
  navigationContext,
}: ItemRatingsCommentsProps) => {
  const { isAuthenticated, userId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userRating, setUserRating] = useState<number | null>(null);

  const { data: ratingStats, isLoading: ratingLoading } = useQuery({
    queryKey: ["ratingStats", itemId],
    queryFn: () => ratingsApi.getStats(itemId),
    enabled: true,
  });

  const { data: userRatingData } = useQuery({
    queryKey: ["userRating", itemId],
    queryFn: () => ratingsApi.getUserRating(itemId),
    enabled: isAuthenticated,
  });

  const { data: commentsData } = useQuery({
    queryKey: ["comments", itemId],
    queryFn: () => commentsApi.getByItemId(itemId),
    enabled: true,
  });

  // Reset rating state when itemId changes
  useEffect(() => {
    setUserRating(null);
  }, [itemId]);

  // Initialize user rating from API response
  useEffect(() => {
    if (userRatingData) {
      setUserRating(userRatingData.stars);
    } else if (userRatingData === null) {
      // Explicitly null means no rating exists
      setUserRating(null);
    }
  }, [userRatingData]);

  const ratingMutation = useMutation({
    mutationFn: (stars: number | null) =>
      ratingsApi.createOrUpdate({ itemId, stars }),
    onSuccess: (response) => {
      setUserRating(response.stars);
      queryClient.invalidateQueries({ queryKey: ["ratingStats", itemId] });
      queryClient.invalidateQueries({ queryKey: ["userRating", itemId] });
    },
  });

  const handleStarClick = (stars: number) => {
    if (!isAuthenticated) return;
    const newRating = userRating === stars ? null : stars;
    ratingMutation.mutate(newRating);
  };

  const commentsCount = commentsData?.comments.length || 0;
  const averageStars = ratingStats?.averageStars;
  const ratingCount = ratingStats?.count || 0;

  return (
    <div className="mt-4 flex items-center space-x-6 border-t pt-4">
      {/* Star Rating */}
      {isAuthenticated && (
        <div className="flex items-center space-x-1">
          {[1, 2, 3, 4, 5].map((star) => {
            const isFilled = userRating !== null && star <= userRating;
            return (
              <button
                key={star}
                onClick={() => handleStarClick(star)}
                disabled={ratingMutation.isPending}
                className="text-yellow-400 hover:text-yellow-500 disabled:opacity-50"
                title={`Rate ${star} star${star > 1 ? "s" : ""}`}
              >
                {isFilled ? (
                  <StarIconSolid className="h-5 w-5" />
                ) : (
                  <StarIcon className="h-5 w-5" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Average Rating */}
      {averageStars !== null && averageStars !== undefined && (
        <div className="flex items-center space-x-1 text-sm text-gray-600">
          <StarIconSolid className="h-4 w-4 text-yellow-400" />
          <span className="font-medium">{averageStars.toFixed(1)}</span>
          <span className="text-gray-500">({ratingCount})</span>
        </div>
      )}

      {/* Comments Link */}
      <button
        onClick={() => {
          const params = new URLSearchParams();
          if (navigationContext) {
            params.set("mode", navigationContext.mode);
            if (navigationContext.category) {
              params.set("category", navigationContext.category);
            }
            if (navigationContext.collectionId) {
              params.set("collectionId", navigationContext.collectionId);
            }
            params.set(
              "currentIndex",
              navigationContext.currentIndex.toString()
            );
            params.set("itemIds", navigationContext.itemIds.join(","));

            // Navigation context and items are already stored in sessionStorage by ExploreModePage/QuizModePage
          }
          const queryString = params.toString();
          navigate(
            `/items/${itemId}/comments${queryString ? `?${queryString}` : ""}`
          );
        }}
        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
      >
        Comments ({commentsCount})
      </button>
    </div>
  );
};

export default ItemRatingsComments;
