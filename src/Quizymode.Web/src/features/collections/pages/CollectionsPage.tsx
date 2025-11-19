import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collectionsApi } from '@/api/collections';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';

const CollectionsPage = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [collectionName, setCollectionName] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['collections'],
    queryFn: () => collectionsApi.getAll(),
    enabled: isAuthenticated && !authLoading,
    retry: false, // Don't retry if auth fails
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => collectionsApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      setShowCreateModal(false);
      setCollectionName('');
    },
    onError: (error: unknown) => {
      console.error('Failed to create collection:', error);
    },
  });

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (collectionName.trim()) {
      createMutation.mutate(collectionName.trim());
    }
  };

  // Wait for auth to finish loading before making decisions
  if (authLoading) {
    return <LoadingSpinner />;
  }

  // Only redirect if auth is finished loading and user is not authenticated
  if (!authLoading && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load collections" onRetry={() => refetch()} />;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">My Collections</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Create Collection
        </button>
      </div>

      {/* Create Collection Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
          onClick={() => {
            if (!createMutation.isPending) {
              setShowCreateModal(false);
              setCollectionName('');
            }
          }}
        >
          <div
            className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Create New Collection
              </h3>
              <form onSubmit={handleCreateCollection}>
                <div className="mb-4">
                  <label
                    htmlFor="collection-name"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Collection Name
                  </label>
                  <input
                    id="collection-name"
                    type="text"
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                    placeholder="Enter collection name"
                    required
                    maxLength={200}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setCollectionName('');
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    disabled={createMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || !collectionName.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
              {createMutation.isError && (
                <div className="mt-3 text-sm text-red-600">
                  Failed to create collection. Please try again.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {data?.collections && data.collections.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.collections.map((collection) => (
            <Link
              key={collection.id}
              to={`/collections/${collection.id}`}
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow p-6"
            >
              <h3 className="text-lg font-medium text-gray-900">{collection.name}</h3>
              <p className="mt-2 text-sm text-gray-500">
                Created {new Date(collection.createdAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No collections found. Create your first collection!</p>
        </div>
      )}
    </div>
  );
};

export default CollectionsPage;

