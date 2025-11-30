import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/api/collections";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { MinusIcon } from "@heroicons/react/24/outline";

const CollectionDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const {
    data: collectionData,
    isLoading: isLoadingCollection,
    error: collectionError,
  } = useQuery({
    queryKey: ["collection", id],
    queryFn: () => collectionsApi.getById(id!),
    enabled: !!id,
  });

  const {
    data: itemsData,
    isLoading: isLoadingItems,
    error: itemsError,
  } = useQuery({
    queryKey: ["collectionItems", id],
    queryFn: () => collectionsApi.getItems(id!),
    enabled: !!id,
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) => collectionsApi.removeItem(id!, itemId),
    onSuccess: () => {
      // Invalidate queries to refresh the list and collection data
      queryClient.invalidateQueries({ queryKey: ["collectionItems", id] });
      queryClient.invalidateQueries({ queryKey: ["collection", id] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const handleRemoveItem = (itemId: string) => {
    if (
      window.confirm(
        "Are you sure you want to remove this item from the collection?"
      )
    ) {
      removeItemMutation.mutate(itemId);
    }
  };

  const isLoading = isLoadingCollection || isLoadingItems;
  const error = collectionError || itemsError;

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return (
      <ErrorMessage
        message="Failed to load collection"
        onRetry={() => window.location.reload()}
      />
    );

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        {collectionData?.name || "Collection Items"}
      </h1>
      {itemsData?.items && itemsData.items.length > 0 ? (
        <div className="space-y-4">
          {itemsData.items.map((item) => (
            <div
              key={item.id}
              className="bg-white shadow rounded-lg p-6 flex justify-between items-start"
            >
              <div className="flex-1">
                <h3 className="text-lg font-medium text-gray-900">
                  {item.question}
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  {item.category} {item.subcategory && `• ${item.subcategory}`}
                </p>
              </div>
              <button
                onClick={() => handleRemoveItem(item.id)}
                disabled={removeItemMutation.isPending}
                className="ml-4 p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Remove from collection"
              >
                <MinusIcon className="h-5 w-5" />
              </button>
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
