import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link, useSearchParams } from "react-router-dom";
import {
  TrashIcon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";

const CollectionsPage = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [searchParams] = useSearchParams();
  const selectedCollectionId = searchParams.get("selected");
  const selectedCollectionRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.getAll(),
    enabled: isAuthenticated && !authLoading,
    retry: false, // Don't retry if auth fails
  });

  // Scroll to selected collection when data is loaded
  useEffect(() => {
    if (selectedCollectionId && data?.collections && selectedCollectionRef.current) {
      setTimeout(() => {
        selectedCollectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    }
  }, [selectedCollectionId, data?.collections]);

  const createMutation = useMutation({
    mutationFn: (name: string) => collectionsApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setShowCreateModal(false);
      setCollectionName("");
    },
    onError: (error: unknown) => {
      console.error("Failed to create collection:", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => collectionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: (error: unknown) => {
      console.error("Failed to delete collection:", error);
    },
  });

  const handleDeleteCollection = (
    collectionId: string,
    collectionName: string
  ) => {
    if (
      window.confirm(
        `Are you sure you want to delete "${collectionName}"? This action cannot be undone.`
      )
    ) {
      deleteMutation.mutate(collectionId);
    }
  };

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (collectionName.trim()) {
      createMutation.mutate(collectionName.trim());
    }
  };

  // Wait for auth to finish loading before making decisions
  if (authLoading) {
    return <LoadingSpinner />;
  }

  // Only redirect if auth is finished loading and user is not authenticated
  if (!authLoading && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return (
      <ErrorMessage
        message="Failed to load collections"
        onRetry={() => refetch()}
      />
    );

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Collections</h1>
        <p className="text-gray-600 text-sm">
          Organize quiz items into custom collections. Group related items together for easier study and practice.
        </p>
      </div>
      <div className="mb-6 flex justify-end items-center">
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Create Collection
        </button>
      </div>

      {/* Create Collection Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
          onClick={() => {
            if (!createMutation.isPending) {
              setShowCreateModal(false);
              setCollectionName("");
            }
          }}
        >
          <div
            className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Create New Collection
              </h3>
              <form onSubmit={handleCreateCollection}>
                <div className="mb-4">
                  <label
                    htmlFor="collection-name"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Collection Name
                  </label>
                  <input
                    id="collection-name"
                    type="text"
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                    placeholder="Enter collection name"
                    required
                    maxLength={200}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setCollectionName("");
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    disabled={createMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      createMutation.isPending || !collectionName.trim()
                    }
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createMutation.isPending ? "Creating..." : "Create"}
                  </button>
                </div>
              </form>
              {createMutation.isError && (
                <div className="mt-3 text-sm text-red-600">
                  Failed to create collection. Please try again.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {data?.collections && data.collections.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.collections.map((collection) => (
            <div
              key={collection.id}
              ref={selectedCollectionId === collection.id ? selectedCollectionRef : null}
              className={`bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow p-6 ${
                selectedCollectionId === collection.id
                  ? "ring-2 ring-indigo-500 ring-offset-2"
                  : ""
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <Link to={`/collections/${collection.id}`} className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">
                    {collection.name}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500">
                    {collection.itemCount}{" "}
                    {collection.itemCount === 1 ? "item" : "items"}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Created{" "}
                    {new Date(collection.createdAt).toLocaleDateString()}
                  </p>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteCollection(collection.id, collection.name);
                  }}
                  disabled={deleteMutation.isPending}
                  className="ml-2 p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Delete collection"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="flex space-x-2 mt-4">
                <Link
                  to={`/collections/${collection.id}`}
                  className="flex items-center px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ListBulletIcon className="h-4 w-4 mr-1" />
                  List Items
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">
            No collections found. Create your first collection!
          </p>
        </div>
      )}
    </div>
  );
};

export default CollectionsPage;
