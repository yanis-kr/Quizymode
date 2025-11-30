import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UserProfileModal = ({ isOpen, onClose }: UserProfileModalProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => usersApi.getCurrent(),
    enabled: isOpen,
  });

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
    if (user) {
      setName(user.name || "");
    }
  };

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const displayName = user.name || user.email || "User";
  const role = user.isAdmin ? "Admin" : "User";

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
                {user.name || "Not set"}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <div className="px-3 py-2 bg-gray-50 rounded-md text-sm text-gray-900">
              {user.email || "Not set"}
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
              {new Date(user.createdAt).toLocaleDateString()}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Login
            </label>
            <div className="px-3 py-2 bg-gray-50 rounded-md text-sm text-gray-900">
              {new Date(user.lastLogin).toLocaleDateString()}
            </div>
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
                  setName(user.name || "");
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
};

export default UserProfileModal;

