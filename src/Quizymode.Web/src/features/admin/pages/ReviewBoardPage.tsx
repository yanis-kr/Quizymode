import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";

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
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Review Board</h1>
      {data?.items && data.items.length > 0 ? (
        <div className="space-y-4">
          {data.items.map((item) => (
            <div key={item.id} className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">
                    {item.question}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500">
                    Answer: {item.correctAnswer}
                  </p>
                  {item.explanation && (
                    <p className="mt-1 text-sm text-gray-600">
                      {item.explanation}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-gray-500">{item.category}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Created by: {item.createdBy}
                  </p>
                </div>
                <button
                  onClick={() => approveMutation.mutate(item.id)}
                  disabled={approveMutation.isPending}
                  className="ml-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {approveMutation.isPending ? "Approving..." : "Approve"}
                </button>
              </div>
            </div>
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

export default ReviewBoardPage;
