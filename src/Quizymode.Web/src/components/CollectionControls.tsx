import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import type { CollectionResponse } from "@/types/api";

interface CollectionControlsProps {
  itemId: string;
}

const CollectionControls = ({ itemId }: CollectionControlsProps) => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [showAddToCollection, setShowAddToCollection] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");

  const { data: collectionsData, isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.getAll(),
    enabled: isAuthenticated,
  });

  const { data: itemCollectionsData } = useQuery({
    queryKey: ["itemCollections", itemId],
    queryFn: async () => {
      // Get all collections and check which ones contain this item
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
    enabled: isAuthenticated && !!collectionsData,
  });

  const addToCollectionMutation = useMutation({
    mutationFn: (collectionId: string) =>
      collectionsApi.addItem(collectionId, { itemId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["itemCollections", itemId] });
      setShowAddToCollection(false);
      setSelectedCollectionId("");
    },
  });

  // Note: Remove item from collection endpoint not yet available in API
  // For now, users can remove items by going to the collection detail page

  const itemCollections = itemCollectionsData?.collections || [];

  if (!isAuthenticated) {
    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">
          Sign in to add items to collections
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="mt-4 text-sm text-gray-500">Loading collections...</div>;
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Add to Collection */}
      <div>
        <button
          onClick={() => setShowAddToCollection(!showAddToCollection)}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Add to Collection
        </button>

        {showAddToCollection && (
          <div className="mt-2 p-4 bg-gray-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Collection
            </label>
            <select
              value={selectedCollectionId}
              onChange={(e) => setSelectedCollectionId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
            >
              <option value="">Choose a collection...</option>
              {collectionsData?.collections
                .filter((c) => !itemCollections.some((ic) => ic.id === c.id))
                .map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
            </select>
            {collectionsData?.collections.length === 0 && (
              <p className="text-sm text-gray-500 mb-2">
                No collections yet. Create one first!
              </p>
            )}
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowAddToCollection(false);
                  setSelectedCollectionId("");
                }}
                className="px-3 py-1 text-sm text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedCollectionId) {
                    addToCollectionMutation.mutate(selectedCollectionId);
                  }
                }}
                disabled={!selectedCollectionId || addToCollectionMutation.isPending}
                className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* My Collections */}
      {itemCollections.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-900 mb-2">
            In My Collections:
          </h4>
          <div className="space-y-2">
            {itemCollections.map((collection) => (
              <div
                key={collection.id}
                className="flex justify-between items-center p-2 bg-gray-50 rounded-md"
              >
                <span className="text-sm text-gray-700">{collection.name}</span>
                <Link
                  to={`/collections/${collection.id}`}
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  View Collection
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectionControls;

