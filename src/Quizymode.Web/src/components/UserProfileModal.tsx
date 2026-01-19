import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSize } from "@/hooks/usePageSize";
import type { UserResponse } from "@/types/api";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UserProfileModal = ({ isOpen, onClose }: UserProfileModalProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [isEditingPageSize, setIsEditingPageSize] = useState(false);
  const [pageSizeInput, setPageSizeInput] = useState("10");
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { pageSize, updatePageSize, isUpdating } = usePageSize();

  // Try to get cached data first - check this outside the query
  const cachedUser = queryClient.getQueryData<UserResponse>(["currentUser"]);

  // Only fetch if we don't have cached data AND modal is open AND user is authenticated
  const shouldFetch = isOpen && isAuthenticated && !cachedUser;

  const {
    data: user,
    isLoading,
    isError,
    error,
    status,
  } = useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      try {
        const result = await usersApi.getCurrent();
        return result;
      } catch (err) {
        console.error("Failed to fetch user:", err);
        throw err;
      }
    },
    enabled: shouldFetch, // Only fetch if modal is open, authenticated, and no cached data
    retry: false, // Don't retry on errors
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchOnMount: false, // Don't refetch if we have cached data
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  // Use cached data first, then fetched data - this ensures we show cached data immediately
  const displayUser = cachedUser || user;

  // Debug logging (remove in production)
  useEffect(() => {
    if (isOpen) {
      console.log("UserProfileModal state:", {
        isOpen,
        isAuthenticated,
        cachedUser: !!cachedUser,
        user: !!user,
        displayUser: !!displayUser,
        isLoading,
        isError,
        status,
        shouldFetch,
      });
    }
  }, [
    isOpen,
    isAuthenticated,
    cachedUser,
    user,
    displayUser,
    isLoading,
    isError,
    status,
    shouldFetch,
  ]);

  // Initialize name when user data loads
  useEffect(() => {
    if (displayUser && !isEditing) {
      setName(displayUser.name || "");
    }
  }, [displayUser, isEditing]);

  // Initialize page size input when page size changes
  useEffect(() => {
    if (!isEditingPageSize) {
      setPageSizeInput(pageSize.toString());
    }
  }, [pageSize, isEditingPageSize]);

  const updateNameMutation = useMutation({
    mutationFn: (newName: string) => usersApi.updateName({ name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      setIsEditing(false);
    },
  });

  const handleSave = () => {
    if (name.trim()) {
      updateNameMutation.mutate(name.trim());
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (displayUser) {
      setName(displayUser.name || "");
    }
  };

  const handleSavePageSize = () => {
    const newPageSize = parseInt(pageSizeInput, 10);
    if (!isNaN(newPageSize) && newPageSize >= 1 && newPageSize <= 1000) {
      updatePageSize(newPageSize);
      setIsEditingPageSize(false);
    }
  };

  const handleCancelPageSize = () => {
    setIsEditingPageSize(false);
    setPageSizeInput(pageSize.toString());
  };

  if (!isOpen) return null;

  if (!isAuthenticated) {
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
            <h3 className="text-lg font-medium text-gray-900">User Profile</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <div className="text-sm text-gray-600 mb-4">
            Please sign in to view your profile.
          </div>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // If we have cached or fetched user data, show it immediately (don't wait for loading)
  if (displayUser) {
    const role = displayUser.isAdmin ? "Admin" : "User";

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
            <h3 className="text-lg font-medium text-gray-900">User Profile</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  autoFocus
                />
              ) : (
                <div className="px-3 py-2 bg-gray-50 rounded-md text-sm text-gray-900">
                  {displayUser.name || "Not set"}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <div className="px-3 py-2 bg-gray-50 rounded-md text-sm text-gray-900">
                {displayUser.email || "Not set"}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <div className="px-3 py-2 bg-gray-50 rounded-md text-sm text-gray-900">
                {role}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Created At
              </label>
              <div className="px-3 py-2 bg-gray-50 rounded-md text-sm text-gray-900">
                {new Date(displayUser.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Login
              </label>
              <div className="px-3 py-2 bg-gray-50 rounded-md text-sm text-gray-900">
                {new Date(displayUser.lastLogin).toLocaleDateString()}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Page Size
              </label>
              <p className="text-xs text-gray-500 mb-1">
                Number of items displayed per page (1-1000)
              </p>
              {isEditingPageSize ? (
                <div className="space-y-2">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={pageSizeInput}
                    onChange={(e) => setPageSizeInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    autoFocus
                  />
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={handleCancelPageSize}
                      disabled={isUpdating}
                      className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSavePageSize}
                      disabled={isUpdating || !pageSizeInput || parseInt(pageSizeInput, 10) < 1 || parseInt(pageSizeInput, 10) > 1000}
                      className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isUpdating ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="px-3 py-2 bg-gray-50 rounded-md text-sm text-gray-900">
                    {pageSize} items per page
                  </div>
                  <button
                    onClick={() => setIsEditingPageSize(true)}
                    className="ml-2 px-3 py-1 text-xs font-medium text-indigo-600 bg-white border border-indigo-600 rounded-md hover:bg-indigo-50"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="flex justify-end space-x-2 pt-4">
                <button
                  onClick={handleCancel}
                  disabled={updateNameMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateNameMutation.isPending || !name.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {updateNameMutation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            ) : (
              <div className="flex justify-end pt-4">
                <button
                  onClick={() => {
                    setName(displayUser.name || "");
                    setIsEditing(true);
                  }}
                  className="px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-600 rounded-md hover:bg-indigo-50"
                >
                  Update Name
                </button>
              </div>
            )}

            {updateNameMutation.isError && (
              <div className="mt-2 text-sm text-red-600">
                Failed to update name. Please try again.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show error if query failed
  if (isError) {
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
            <h3 className="text-lg font-medium text-gray-900">Error</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <div className="text-sm text-red-600 mb-4">
            {error instanceof Error
              ? error.message
              : "Failed to load user profile. Please try again."}
          </div>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Only show loading if we don't have any user data AND query is actually loading (not just refetching)
  // Check status === 'pending' instead of isLoading to avoid showing loading when we have cached data
  if (!displayUser && (isLoading || status === "pending")) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  // Fallback: no user data available
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
          <h3 className="text-lg font-medium text-gray-900">User Profile</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        <div className="text-sm text-gray-600 mb-4">
          User data not available. Please try again later.
        </div>
        <button
          onClick={onClose}
          className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default UserProfileModal;
