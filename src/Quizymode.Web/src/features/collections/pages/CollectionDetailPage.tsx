import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { collectionsApi } from '@/api/collections';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';

const CollectionDetailPage = () => {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['collection', id],
    queryFn: async () => {
      const result = await collectionsApi.getItems(id!);
      return { items: result.items };
    },
    enabled: !!id,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load collection" onRetry={() => refetch()} />;

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Collection Items</h1>
      {data?.items && data.items.length > 0 ? (
        <div className="space-y-4">
          {data.items.map((item) => (
            <div key={item.id} className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900">{item.question}</h3>
              <p className="mt-2 text-sm text-gray-500">
                {item.category} {item.subcategory && `• ${item.subcategory}`}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No items in this collection.</p>
        </div>
      )}
    </div>
  );
};

export default CollectionDetailPage;

