import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import ItemListSection from "@/components/ItemListSection";
import useItemSelection from "@/hooks/useItemSelection";
import { MinusIcon, ArrowLeftIcon, EyeIcon, AcademicCapIcon } from "@heroicons/react/24/outline";

const CollectionDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  const items = itemsData?.items || [];
  const currentPageItemIds = items.map((item) => item.id);
  const {
    selectedItemIds,
    selectAll,
    deselectAll,
    toggleItem,
  } = useItemSelection(currentPageItemIds);

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
      <div className="mb-6 flex items-center space-x-4">
        <button
          onClick={() => navigate("/collections")}
          className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Go Back
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          {collectionData?.name || "Collection Items"}
        </h1>
      </div>
      <p className="text-gray-600 text-sm mb-6">
        View and manage items in this collection. Explore items to study them, take quizzes to test your knowledge, or remove items from the collection.
      </p>

      {items.length > 0 ? (
        <ItemListSection
          items={items}
          totalCount={items.length}
          page={1}
          totalPages={1}
          selectedItemIds={selectedItemIds}
          onPrevPage={() => {}}
          onNextPage={() => {}}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onAddSelectedToCollection={() => {}}
          onToggleSelect={toggleItem}
          isAuthenticated={isAuthenticated}
          renderActions={(item) => (
            <>
              <button
                onClick={() => navigate(`/explore/item/${item.id}`)}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md"
                title="View item"
              >
                <EyeIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => navigate(`/quiz/item/${item.id}`)}
                className="p-2 text-purple-600 hover:bg-purple-50 rounded-md"
                title="Quiz mode"
              >
                <AcademicCapIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => handleRemoveItem(item.id)}
                disabled={removeItemMutation.isPending}
                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Remove from collection"
              >
                <MinusIcon className="h-5 w-5" />
              </button>
            </>
          )}
        />
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">No items in this collection.</p>
        </div>
      )}
    </div>
  );
};

export default CollectionDetailPage;
