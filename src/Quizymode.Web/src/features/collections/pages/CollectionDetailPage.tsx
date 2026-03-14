import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { ItemListView } from "@/components/ItemListView";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import useItemSelection from "@/hooks/useItemSelection";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

const CollectionDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, userId } = useAuth();
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
      queryClient.invalidateQueries({ queryKey: ["collectionItems", id] });
      queryClient.invalidateQueries({ queryKey: ["collection", id] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const isOwner = isAuthenticated && userId && collectionData?.createdBy === userId;

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
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
        {items.length > 0 && (
          <ModeSwitcher
            availableModes={["list", "explore", "quiz"]}
            activeMode="list"
            onChange={(mode) => {
              if (mode === "explore") navigate(`/explore/collection/${id}`);
              else if (mode === "quiz") navigate(`/quiz/collection/${id}`);
            }}
          />
        )}
      </div>
      <p className="text-gray-600 text-sm mb-6">
        View and manage items in this collection. Explore items to study them, take quizzes to test your knowledge, or remove items from the collection.
      </p>

      {items.length > 0 ? (
        <ItemListView
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
          config={{
            selectable: true,
            showExplore: true,
            showQuiz: true,
            showRemoveFromCollection: !!isOwner,
          }}
          isAuthenticated={isAuthenticated}
          collectionId={id}
          onRemoveFromCollection={(_, itemId) => handleRemoveItem(itemId)}
          onKeywordClick={(keywordName, item) => {
            const params = new URLSearchParams();
            if (item?.category) params.set("category", item.category);
            params.set("keywords", keywordName);
            navigate(`/my-items?${params.toString()}`);
          }}
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
