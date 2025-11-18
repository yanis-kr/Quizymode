import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { itemsApi } from '@/api/items';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';
import { useState } from 'react';

const MyItemsPage = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['myItems', page],
    queryFn: () => itemsApi.getAll(undefined, undefined, page, pageSize),
    enabled: isAuthenticated,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => itemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myItems'] });
    },
  });

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load items" onRetry={() => refetch()} />;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">My Items</h1>
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
          Create Item
        </button>
      </div>

      {data?.items && data.items.length > 0 ? (
        <div className="space-y-4">
          {data.items.map((item) => (
            <div key={item.id} className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">{item.question}</h3>
                  <p className="mt-2 text-sm text-gray-500">
                    {item.category} {item.subcategory && `• ${item.subcategory}`}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {item.isPrivate ? 'Private' : 'Public'}
                  </p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(item.id)}
                  className="ml-4 px-4 py-2 text-sm text-red-600 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No items found. Create your first item!</p>
        </div>
      )}
    </div>
  );
};

export default MyItemsPage;

