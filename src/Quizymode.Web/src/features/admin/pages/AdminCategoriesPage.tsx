import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { adminApi, type UpdateCategoryRequest } from "@/api/admin";
import { categoriesApi } from "@/api/categories";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";

const AdminCategoriesPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: !!isAuthenticated && !!isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategoryRequest }) =>
      adminApi.updateCategory(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return (
      <ErrorMessage
        message="Failed to load categories"
        onRetry={() => refetch()}
      />
    );

  const categories = data?.categories ?? [];

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex items-center gap-4">
        <Link
          to="/admin"
          className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
        >
          ← Admin Dashboard
        </Link>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Manage Categories</h1>
      <p className="text-gray-600 text-sm mb-6">
        Rename categories. Changes affect navigation and item grouping.
      </p>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Category name
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Items
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categories
                .sort((a, b) => a.category.localeCompare(b.category))
                .map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    id={cat.id}
                    name={cat.category}
                    itemCount={cat.count}
                    onSave={(body) =>
                      updateMutation.mutate({ id: cat.id, body })
                    }
                    isSaving={updateMutation.isPending}
                    saveError={updateMutation.error}
                  />
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {categories.length === 0 && (
        <p className="text-gray-500 text-center py-8">No categories found.</p>
      )}
    </div>
  );
};

function CategoryRow({
  id,
  name,
  itemCount,
  onSave,
  isSaving,
  saveError,
}: {
  id: string;
  name: string;
  itemCount: number;
  onSave: (body: UpdateCategoryRequest) => void;
  isSaving: boolean;
  saveError: unknown;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(name);

  React.useEffect(() => {
    setValue(name);
  }, [name]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) {
      onSave({ name: trimmed });
      setEditing(false);
    } else {
      setValue(name);
      setEditing(false);
    }
  };

  const handleCancel = () => {
    setValue(name);
    setEditing(false);
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2">
        {editing ? (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rounded border-gray-300 text-sm w-full max-w-xs"
            autoFocus
          />
        ) : (
          <span className="text-sm font-medium text-gray-900">{name}</span>
        )}
      </td>
      <td className="px-4 py-2 text-sm text-gray-600">{itemCount}</td>
      <td className="px-4 py-2 text-right">
        {editing ? (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !value.trim()}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 mr-2"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Rename
          </button>
        )}
        {saveError && (
          <p className="text-xs text-red-600 mt-1">Save failed. Try again.</p>
        )}
      </td>
    </tr>
  );
}

export default AdminCategoriesPage;
