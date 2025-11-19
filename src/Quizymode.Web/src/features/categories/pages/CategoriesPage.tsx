import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { categoriesApi } from '@/api/categories';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';

const CategoriesPage = () => {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['categories', search],
    queryFn: () => categoriesApi.getAll(search || undefined),
  });

  const handleCategorySelect = (category: string) => {
    navigate(`/items?category=${encodeURIComponent(category)}`);
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load categories" onRetry={() => refetch()} />;

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Select a Category</h1>
        <div className="max-w-md">
          <input
            type="text"
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-2 border"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.categories.map((category) => (
          <button
            key={category.category}
            onClick={() => handleCategorySelect(category.category)}
            className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow p-6 text-left"
          >
            <h3 className="text-lg font-medium text-gray-900">{category.category}</h3>
            <p className="mt-2 text-sm text-gray-500">{category.count} items</p>
          </button>
        ))}
      </div>

      {data?.categories.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No categories found.</p>
        </div>
      )}
    </div>
  );
};

export default CategoriesPage;

