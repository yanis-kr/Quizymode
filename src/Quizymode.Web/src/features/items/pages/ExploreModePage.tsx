import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { itemsApi } from '@/api/items';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';
import ReactionsComments from '@/components/ReactionsComments';
import CollectionControls from '@/components/CollectionControls';
import { Link } from 'react-router-dom';

const ExploreModePage = () => {
  const { category } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [count] = useState(10);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['randomItems', category, count],
    queryFn: () => itemsApi.getRandom(category, undefined, count),
  });

  const items = data?.items || [];
  const currentItem = items[currentIndex];

  useEffect(() => {
    if (items.length > 0 && currentIndex >= items.length) {
      setCurrentIndex(0);
    }
  }, [items.length, currentIndex]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load items" onRetry={() => refetch()} />;
  if (items.length === 0) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No items found.</p>
          <Link to="/categories" className="text-indigo-600 hover:text-indigo-700">
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
            <h2 className="text-2xl font-bold text-gray-900">Explore Mode</h2>
            <div className="text-sm text-gray-500">
              {currentIndex + 1} of {items.length}
            </div>
          </div>

          {currentItem && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Question</h3>
                <p className="text-gray-700">{currentItem.question}</p>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Answer</h3>
                <p className="text-gray-700 font-semibold">{currentItem.correctAnswer}</p>
              </div>

              {currentItem.explanation && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Explanation</h3>
                  <p className="text-gray-700">{currentItem.explanation}</p>
                </div>
              )}

              <div className="text-sm text-gray-500">
                Category: {currentItem.category}
                {currentItem.subcategory && ` • ${currentItem.subcategory}`}
              </div>

              {/* Reactions and Comments */}
              <ReactionsComments itemId={currentItem.id} />

              {/* Collection Controls */}
              <CollectionControls itemId={currentItem.id} />
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentIndex((prev) => Math.min(items.length - 1, prev + 1))}
              disabled={currentIndex === items.length - 1}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>

        {!isAuthenticated && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-yellow-800">
              <Link to="/signup" className="font-medium underline">
                Sign up
              </Link>{' '}
              or{' '}
              <Link to="/login" className="font-medium underline">
                sign in
              </Link>{' '}
              to create your own items and collections!
            </p>
          </div>
        )}

        <div className="text-center">
          <Link
            to={category ? `/items?category=${encodeURIComponent(category)}` : '/categories'}
            className="text-indigo-600 hover:text-indigo-700"
          >
            ← Back to items
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ExploreModePage;

