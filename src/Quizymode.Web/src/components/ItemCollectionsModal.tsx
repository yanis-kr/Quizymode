import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/api/collections";
import { itemsApi } from "@/api/items";
import { useAuth } from "@/contexts/AuthContext";
import { XMarkIcon, PlusIcon } from "@heroicons/react/24/outline";

interface ItemCollectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId?: string;
  itemIds?: string[];
}

const ItemCollectionsModal = ({
  isOpen,
  onClose,
  itemId,
  itemIds,
}: ItemCollectionsModalProps) => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [newCollectionName, setNewCollectionName] = useState("");
  const [bulkSelectedCollections, setBulkSelectedCollections] = useState<Set<string>>(new Set());

  // Support both single item and multiple items
  const singleItemId = itemId;
  const multipleItemIds = itemIds || [];
  const isBulkMode = multipleItemIds.length > 0;

  const { data: collectionsData, isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.getAll(),
    enabled: isAuthenticated && isOpen,
  });

  // Use GET /items/{id} instead of GET /items/{id}/collections to get collections
  const { data: itemData, isLoading: isLoadingItemCollections, refetch: refetchItemCollections } = useQuery({
    queryKey: ["item", singleItemId],
    queryFn: () => itemsApi.getById(singleItemId!),
    enabled: isAuthenticated && isOpen && !isBulkMode && !!singleItemId,
    refetchOnMount: 'always',
  });

  const removeFromCollectionMutation = useMutation({
    mutationFn: async (collectionId: string) => {
      if (isBulkMode) {
        // Remove all items from the collection
        await Promise.all(
          multipleItemIds.map((id) =>
            collectionsApi.removeItem(collectionId, id)
          )
        );
      } else if (singleItemId) {
        await collectionsApi.removeItem(collectionId, singleItemId);
      }
    },
    onSuccess: async () => {
      if (isBulkMode) {
        // Invalidate items list queries to refresh the UI with updated collection data
        queryClient.invalidateQueries({ queryKey: ["myItems"] });
        queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
        // Refetch item queries for all items in bulk mode (to get updated collections)
        await Promise.all(
          multipleItemIds.map((itemId) =>
            queryClient.refetchQueries({ queryKey: ["item", itemId] })
          )
        );
        // Update bulk selected collections state
        setBulkSelectedCollections((prev) => {
          const newSet = new Set(prev);
          // Note: In bulk mode, we don't track removals, so we keep the state as is
          return newSet;
        });
      } else if (singleItemId) {
        // Invalidate items list queries to refresh the UI with updated collection data
        queryClient.invalidateQueries({ queryKey: ["myItems"] });
        queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
        await queryClient.refetchQueries({ queryKey: ["item", singleItemId] });
      }
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const createCollectionMutation = useMutation({
    mutationFn: (name: string) => collectionsApi.create({ name }),
    onSuccess: async (newCollection) => {
      await queryClient.refetchQueries({ queryKey: ["collections"] });
      // Automatically add item(s) to the newly created collection
      if (isBulkMode) {
        await collectionsApi.bulkAddItems(newCollection.id, { itemIds: multipleItemIds });
        // Update bulk selected collections state
        setBulkSelectedCollections((prev) => new Set(prev).add(newCollection.id));
        // Invalidate items queries to refresh the UI immediately
        queryClient.invalidateQueries({ queryKey: ["myItems"] });
        queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
        await Promise.all(
          multipleItemIds.map((itemId) =>
            queryClient.refetchQueries({ queryKey: ["item", itemId] })
          )
        );
      } else if (singleItemId) {
        await collectionsApi.addItem(newCollection.id, { itemId: singleItemId });
        // Invalidate items list queries to refresh the UI with updated collection data
        queryClient.invalidateQueries({ queryKey: ["myItems"] });
        queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
        // Refetch item query to update checkbox state
        await queryClient.refetchQueries({ queryKey: ["item", singleItemId] });
      }
      setNewCollectionName("");
    },
  });

  const addToCollectionMutation = useMutation({
    mutationFn: async (collectionId: string) => {
      if (isBulkMode) {
        // Add all items to the collection using bulk endpoint
        await collectionsApi.bulkAddItems(collectionId, { itemIds: multipleItemIds });
      } else if (singleItemId) {
        await collectionsApi.addItem(collectionId, { itemId: singleItemId });
      }
    },
    onSuccess: async (_, collectionId) => {
      // Update bulk selected collections state on success
      if (isBulkMode) {
        setBulkSelectedCollections((prev) => new Set(prev).add(collectionId));
        // Invalidate items queries to refresh the UI immediately
        queryClient.invalidateQueries({ queryKey: ["myItems"] });
        queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
        await Promise.all(
          multipleItemIds.map((itemId) =>
            queryClient.refetchQueries({ queryKey: ["item", itemId] })
          )
        );
      }
      if (singleItemId) {
        // Invalidate items list queries to refresh the UI with updated collection data
        queryClient.invalidateQueries({ queryKey: ["myItems"] });
        queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
        await queryClient.refetchQueries({ queryKey: ["item", singleItemId] });
      }
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const handleCreateCollection = () => {
    if (newCollectionName.trim()) {
      createCollectionMutation.mutate(newCollectionName.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleCreateCollection();
    }
  };

  const handleToggleCollection = (collectionId: string, isChecked: boolean) => {
    if (isChecked) {
      // Add to collection
      if (isBulkMode) {
        // Optimistically update state for immediate UI feedback
        setBulkSelectedCollections((prev) => new Set(prev).add(collectionId));
      }
      addToCollectionMutation.mutate(collectionId);
    } else {
      // Remove from collection
      if (isBulkMode) {
        // In bulk mode, we don't allow removing (only adding)
        // But if somehow we get here, we should handle it
        setBulkSelectedCollections((prev) => {
          const newSet = new Set(prev);
          newSet.delete(collectionId);
          return newSet;
        });
      } else {
        removeFromCollectionMutation.mutate(collectionId);
      }
    }
  };

  // Refetch item collections when modal opens in single-item mode
  useEffect(() => {
    if (isOpen && !isBulkMode && singleItemId && refetchItemCollections) {
      refetchItemCollections();
    }
  }, [isOpen, isBulkMode, singleItemId, refetchItemCollections]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const allCollections = collectionsData?.collections || [];
  const itemCollections = itemData?.collections || [];
  const itemCollectionIds = new Set(itemCollections.map((ic) => ic.id));

  return (
    <div
      className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
      onClick={onClose}
    >
      <div
        className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {isBulkMode
              ? `Add ${multipleItemIds.length} Item${multipleItemIds.length > 1 ? "s" : ""} to Collections`
              : "Manage Collections"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {isLoading || (isLoadingItemCollections && !isBulkMode) ? (
          <div className="text-center py-4">Loading collections...</div>
        ) : (
          <div className="space-y-4">
            {/* Create New Collection Textbox */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter collection name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                disabled={createCollectionMutation.isPending}
              />
              <button
                onClick={handleCreateCollection}
                disabled={!newCollectionName.trim() || createCollectionMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="Add new collection"
              >
                <PlusIcon className="h-5 w-5" />
              </button>
            </div>

            {/* All Collections with Checkboxes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Collections
              </label>
              {allCollections.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {allCollections.map((collection) => {
                    // In bulk mode, use local state; otherwise use query data
                    const isInCollection = isBulkMode
                      ? bulkSelectedCollections.has(collection.id)
                      : itemCollectionIds.has(collection.id);
                    return (
                      <label
                        key={collection.id}
                        className="flex items-center p-2 hover:bg-gray-50 rounded-md cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isInCollection}
                          onChange={(e) =>
                            handleToggleCollection(
                              collection.id,
                              e.target.checked
                            )
                          }
                          disabled={
                            addToCollectionMutation.isPending ||
                            removeFromCollectionMutation.isPending
                          }
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-700">
                          {collection.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No collections available
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemCollectionsModal;
