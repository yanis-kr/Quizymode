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

const ItemCollectionsModal = ({ isOpen, onClose, itemId }: ItemCollectionsModalProps) => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showNewCollectionInput, setShowNewCollectionInput] = useState(false);

  const { data: collectionsData, isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.getAll(),
    enabled: isAuthenticated && isOpen,
  });

  const { data: itemCollectionsData } = useQuery({
    queryKey: ["itemCollections", itemId],
    queryFn: async () => {
      const allCollections = collectionsData?.collections || [];
      const itemCollections: CollectionResponse[] = [];
      
      for (const collection of allCollections) {
        try {
          const itemsData = await collectionsApi.getItems(collection.id);
          if (itemsData.items.some((item) => item.id === itemId)) {
            itemCollections.push(collection);
          }
        } catch {
          // Collection might not exist or user doesn't have access
        }
      }
      
      return { collections: itemCollections };
    },
    enabled: isAuthenticated && !!collectionsData && isOpen,
  });

  const createCollectionMutation = useMutation({
    mutationFn: (name: string) => collectionsApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setNewCollectionName("");
      setShowNewCollectionInput(false);
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

  const handleCreateAndAdd = () => {
    if (newCollectionName.trim()) {
      createCollectionMutation.mutate(newCollectionName.trim(), {
        onSuccess: (newCollection) => {
          addToCollectionMutation.mutate(newCollection.id);
        },
      });
    }
  };

  if (!isOpen) return null;

  const allCollections = collectionsData?.collections || [];
  const itemCollections = itemCollectionsData?.collections || [];
  const availableCollections = allCollections.filter(
    (c) => !itemCollections.some((ic) => ic.id === c.id)
  );

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
          <h3 className="text-lg font-medium text-gray-900">Manage Collections</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-4">Loading collections...</div>
        ) : (
          <div className="space-y-4">
            {/* Existing Collections */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add to Collection
              </label>
              {availableCollections.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableCollections.map((collection) => {
                    const isInCollection = itemCollections.some(
                      (ic) => ic.id === collection.id
                    );
                    return (
                      <label
                        key={collection.id}
                        className="flex items-center p-2 hover:bg-gray-50 rounded-md cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isInCollection}
                          onChange={(e) => {
                            if (e.target.checked) {
                              addToCollectionMutation.mutate(collection.id);
                            }
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-700">{collection.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No collections available</p>
              )}
            </div>

            {/* Create New Collection */}
            <div className="border-t pt-4">
              {showNewCollectionInput ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="Enter collection name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    autoFocus
                  />
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => {
                        setShowNewCollectionInput(false);
                        setNewCollectionName("");
                      }}
                      className="px-3 py-1 text-sm text-gray-700 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateAndAdd}
                      disabled={
                        !newCollectionName.trim() ||
                        createCollectionMutation.isPending
                      }
                      className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {createCollectionMutation.isPending ? "Creating..." : "Create & Add"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewCollectionInput(true)}
                  className="w-full px-3 py-2 text-sm text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
                >
                  + Create New Collection
                </button>
              )}
            </div>

            {/* Current Collections */}
            {itemCollections.length > 0 && (
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  In Collections:
                </label>
                <div className="space-y-1">
                  {itemCollections.map((collection) => (
                    <div
                      key={collection.id}
                      className="text-sm text-gray-600 bg-gray-50 p-2 rounded-md"
                    >
                      {collection.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemCollectionsModal;

