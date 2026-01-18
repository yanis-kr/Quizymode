import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import { XMarkIcon } from "@heroicons/react/24/outline";

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

  const { data: itemCollectionsData, isLoading: isLoadingItemCollections } = useQuery({
    queryKey: ["itemCollections", singleItemId],
    queryFn: () => collectionsApi.getCollectionsForItem(singleItemId!),
    enabled: isAuthenticated && isOpen && !isBulkMode && !!singleItemId,
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
    onSuccess: () => {
      if (singleItemId) {
        queryClient.invalidateQueries({ queryKey: ["itemCollections", singleItemId] });
      }
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const createCollectionMutation = useMutation({
    mutationFn: (name: string) => collectionsApi.create({ name }),
    onSuccess: async (newCollection) => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      // Automatically add item(s) to the newly created collection
      if (isBulkMode) {
        await Promise.all(
          multipleItemIds.map((id) =>
            collectionsApi.addItem(newCollection.id, { itemId: id })
          )
        );
      } else if (singleItemId) {
        await collectionsApi.addItem(newCollection.id, { itemId: singleItemId });
      }
      setNewCollectionName("");
    },
  });

  const addToCollectionMutation = useMutation({
    mutationFn: async (collectionId: string) => {
      if (isBulkMode) {
        // Add all items to the collection
        await Promise.all(
          multipleItemIds.map((id) =>
            collectionsApi.addItem(collectionId, { itemId: id })
          )
        );
        // Track selected collection in bulk mode
        setBulkSelectedCollections((prev) => new Set(prev).add(collectionId));
      } else if (singleItemId) {
        await collectionsApi.addItem(collectionId, { itemId: singleItemId });
      }
    },
    onSuccess: () => {
      if (singleItemId) {
        queryClient.invalidateQueries({ queryKey: ["itemCollections", singleItemId] });
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
      addToCollectionMutation.mutate(collectionId);
    } else {
      // In bulk mode, only allow adding (not removing)
      if (!isBulkMode) {
        removeFromCollectionMutation.mutate(collectionId);
      }
    }
  };

  if (!isOpen) return null;

  const allCollections = collectionsData?.collections || [];
  const itemCollections = itemCollectionsData?.collections || [];
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
            <div>
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter collection name and press Enter"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                disabled={createCollectionMutation.isPending}
              />
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
