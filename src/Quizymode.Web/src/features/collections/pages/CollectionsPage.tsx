import { useQuery } from '@tanstack/react-query';
import { collectionsApi } from '@/api/collections';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';

const CollectionsPage = () => {
  const { isAuthenticated } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['collections'],
    queryFn: () => collectionsApi.getAll(),
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load collections" onRetry={() => refetch()} />;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">My Collections</h1>
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
          Create Collection
        </button>
      </div>

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

