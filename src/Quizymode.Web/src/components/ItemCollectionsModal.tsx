import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { CollectionResponse } from "@/types/api";

interface ItemCollectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
}

const ItemCollectionsModal = ({
  isOpen,
  onClose,
  itemId,
}: ItemCollectionsModalProps) => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [newCollectionName, setNewCollectionName] = useState("");

  const { data: collectionsData, isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.getAll(),
    enabled: isAuthenticated && isOpen,
  });

  const { data: itemCollectionsData, isLoading: isLoadingItemCollections } = useQuery({
    queryKey: ["itemCollections", itemId],
    queryFn: () => collectionsApi.getCollectionsForItem(itemId),
    enabled: isAuthenticated && isOpen,
  });

  const removeFromCollectionMutation = useMutation({
    mutationFn: (collectionId: string) =>
      collectionsApi.removeItem(collectionId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["itemCollections", itemId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const createCollectionMutation = useMutation({
    mutationFn: (name: string) => collectionsApi.create({ name }),
    onSuccess: (newCollection) => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      // Automatically add item to the newly created collection
      addToCollectionMutation.mutate(newCollection.id);
      setNewCollectionName("");
    },
  });

  const addToCollectionMutation = useMutation({
    mutationFn: (collectionId: string) =>
      collectionsApi.addItem(collectionId, { itemId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["itemCollections", itemId] });
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
      removeFromCollectionMutation.mutate(collectionId);
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
            Manage Collections
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {isLoading || isLoadingItemCollections ? (
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
                    const isInCollection = itemCollectionIds.has(collection.id);
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
