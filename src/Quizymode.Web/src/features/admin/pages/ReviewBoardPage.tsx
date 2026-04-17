import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { PronunciationHint } from "@/components/items/PronunciationHint";
import { getIndexedSpeech } from "@/utils/itemSpeech";
import type { ItemSpeechSupport } from "@/types/api";

const ReviewBoardPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reviewBoard"],
    queryFn: () => adminApi.getReviewBoardItems(),
    enabled: isAuthenticated && isAdmin,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApi.approveItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviewBoard"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminApi.rejectItem(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviewBoard"] });
    },
  });

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return (
      <ErrorMessage
        message="Failed to load review board items"
        onRetry={() => refetch()}
      />
    );

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Review Board</h1>
      <p className="text-gray-600 text-sm mb-6">
        Review, approve, or reject items that are pending review. Items marked as "Ready for Review" will appear here for admin review before being made available to users.
      </p>
      {data?.items && data.items.length > 0 ? (
        <div className="space-y-4">
          {data.items.map((item) => (
            <ReviewBoardItemCard
              key={item.id}
              item={item}
              onApprove={() => approveMutation.mutate(item.id)}
              isApproving={approveMutation.isPending}
              onReject={(reason) =>
                rejectMutation.mutate({ id: item.id, reason })
              }
              isRejecting={rejectMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No items pending review.</p>
        </div>
      )}
    </div>
  );
};

function ReviewBoardItemCard({
  item,
  onApprove,
  isApproving,
  onReject,
  isRejecting,
}: {
  item: {
    id: string;
    category: string;
    isPrivate: boolean;
    question: string;
    questionSpeech?: ItemSpeechSupport | null;
    correctAnswer: string;
    correctAnswerSpeech?: ItemSpeechSupport | null;
    incorrectAnswers: string[];
    incorrectAnswerSpeech?: Record<number, ItemSpeechSupport> | null;
    explanation: string;
    createdBy: string;
    createdAt: string;
    factualRisk?: number | null;
    reviewComments?: string | null;
  };
  onApprove: () => void;
  isApproving: boolean;
  onReject: (reason?: string) => void;
  isRejecting: boolean;
}) {
  const [reason, setReason] = React.useState("");

  const handleRejectClick = () => {
    onReject(reason.trim() || undefined);
    setReason("");
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-medium text-gray-900">
              {item.question}
            </h3>
            <PronunciationHint text={item.question} speech={item.questionSpeech} />
            <p className="mt-2 text-sm text-gray-500">
              Answer: {item.correctAnswer}
            </p>
            <PronunciationHint
              text={item.correctAnswer}
              speech={item.correctAnswerSpeech}
              className="mt-1 text-sm text-gray-500 italic"
            />
            {item.incorrectAnswers.length > 0 && (
              <div className="mt-1 text-sm text-gray-500">
                <p>Incorrect:</p>
                <ul className="mt-1 list-disc list-inside space-y-1">
                  {item.incorrectAnswers.map((answer, index) => (
                    <li key={`${item.id}-incorrect-${index}`}>
                      <span>{answer}</span>
                      <PronunciationHint
                        text={answer}
                        speech={getIndexedSpeech(item.incorrectAnswerSpeech, index)}
                        className="mt-1 text-sm text-gray-500 italic"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {item.explanation && (
              <p className="mt-1 text-sm text-gray-600">
                {item.explanation}
              </p>
            )}
            <p className="mt-2 text-sm text-gray-500">{item.category}</p>
            <p className="mt-1 text-sm text-gray-500">
              Created by: {item.createdBy}
            </p>
            {item.factualRisk != null && (
              <p className="mt-1 text-sm text-gray-500">
                Factual risk: {(item.factualRisk * 100).toFixed(0)}%
              </p>
            )}
            {item.reviewComments && (
              <div className="mt-2 text-sm text-gray-700 whitespace-pre-line">
                <span className="font-medium">Review comments:</span>{" "}
                {item.reviewComments}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 items-end">
            <button
              onClick={onApprove}
              disabled={isApproving || isRejecting}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
            >
              {isApproving ? "Approving..." : "Approve"}
            </button>
          </div>
        </div>
        <div className="border-t border-gray-200 pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rejection reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Explain why this item is rejected..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleRejectClick}
              disabled={isRejecting || isApproving}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
            >
              {isRejecting ? "Rejecting..." : "Reject"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReviewBoardPage;
