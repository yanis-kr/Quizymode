import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reviewsApi } from "@/api/reviews";
import { useAuth } from "@/contexts/AuthContext";
import type { ReviewResponse } from "@/types/api";

interface ReactionsCommentsProps {
  itemId: string;
}

const ReactionsComments = ({ itemId }: ReactionsCommentsProps) => {
  const { isAuthenticated, userId } = useAuth();
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [editingComment, setEditingComment] = useState(false);
  const [commentText, setCommentText] = useState("");

  const { data: reviewsData, isLoading } = useQuery({
    queryKey: ["reviews", itemId],
    queryFn: () => reviewsApi.getByItemId(itemId),
    enabled: true, // Always load to show reactions/comments
  });

  const reviews = reviewsData?.reviews || [];
  const currentUserReview = reviews.find((r) => r.createdBy === userId);
  const likeCount = reviews.filter((r) => r.reaction === "like").length;
  const dislikeCount = reviews.filter((r) => r.reaction === "dislike").length;

  const createReviewMutation = useMutation({
    mutationFn: (data: { reaction?: string; comment?: string }) => {
      if (currentUserReview) {
        return reviewsApi.update(currentUserReview.id, {
          reaction: data.reaction as "like" | "dislike" | "neutral" | undefined,
          comment: data.comment,
        });
      }
      return reviewsApi.create({
        itemId,
        reaction: (data.reaction || "neutral") as "like" | "dislike" | "neutral",
        comment: data.comment || "",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", itemId] });
      setEditingComment(false);
      setCommentText("");
    },
  });

  const deleteReviewMutation = useMutation({
    mutationFn: (reviewId: string) => reviewsApi.delete(reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", itemId] });
      setEditingComment(false);
      setCommentText("");
    },
  });

  const handleReaction = (reaction: "like" | "dislike") => {
    if (!isAuthenticated) return;
    const newReaction = currentUserReview?.reaction === reaction ? "neutral" : reaction;
    createReviewMutation.mutate({ reaction: newReaction });
  };

  const handleCommentSubmit = () => {
    if (!isAuthenticated) return;
    createReviewMutation.mutate({ comment: commentText });
  };

  const handleCommentDelete = () => {
    if (!currentUserReview?.id) return;
    deleteReviewMutation.mutate(currentUserReview.id);
  };

  if (!isAuthenticated) {
    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">
          Sign in to add reactions and comments
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Reactions */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleReaction("like")}
            disabled={createReviewMutation.isPending}
            className={`px-3 py-1 rounded-md text-sm font-medium ${
              currentUserReview?.reaction === "like"
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            👍 Like ({likeCount})
          </button>
          <button
            onClick={() => handleReaction("dislike")}
            disabled={createReviewMutation.isPending}
            className={`px-3 py-1 rounded-md text-sm font-medium ${
              currentUserReview?.reaction === "dislike"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            👎 Dislike ({dislikeCount})
          </button>
        </div>
      </div>

      {/* My Comment */}
      <div className="border-t pt-4">
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-sm font-medium text-gray-900">My Comment</h4>
          {currentUserReview?.comment && !editingComment && (
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setEditingComment(true);
                  setCommentText(currentUserReview.comment);
                }}
                className="text-xs text-indigo-600 hover:text-indigo-700"
              >
                Edit
              </button>
              <button
                onClick={handleCommentDelete}
                disabled={deleteReviewMutation.isPending}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {editingComment || !currentUserReview?.comment ? (
          <div className="space-y-2">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              rows={3}
            />
            <div className="flex justify-end space-x-2">
              {editingComment && (
                <button
                  onClick={() => {
                    setEditingComment(false);
                    setCommentText("");
                  }}
                  className="px-3 py-1 text-sm text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleCommentSubmit}
                disabled={createReviewMutation.isPending || !commentText.trim()}
                className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {currentUserReview?.comment ? "Update" : "Add"} Comment
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-700">{currentUserReview.comment}</p>
          </div>
        )}
      </div>

      {/* View All Comments */}
      <div className="border-t pt-4">
        <button
          onClick={() => setShowComments(!showComments)}
          className="text-sm text-indigo-600 hover:text-indigo-700"
        >
          {showComments ? "Hide" : "View"} All Comments ({reviews.filter((r) => r.comment).length})
        </button>

        {showComments && (
          <div className="mt-2 space-y-3">
            {reviews
              .filter((r) => r.comment)
              .map((review) => (
                <div key={review.id} className="p-3 bg-gray-50 rounded-md">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-medium text-gray-900">
                      {review.createdBy}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{review.comment}</p>
                </div>
              ))}
            {reviews.filter((r) => r.comment).length === 0 && (
              <p className="text-sm text-gray-500">No comments yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReactionsComments;

