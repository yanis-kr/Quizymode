import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import {
  adminApi,
  type CategoryKeywordAdminResponse,
  type UpdateCategoryKeywordRequest,
  type CreateCategoryKeywordRequest,
} from "@/api/admin";
import { categoriesApi } from "@/api/categories";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";

const AdminKeywordsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [filterCategory, setFilterCategory] = React.useState<string>("");
  const [filterRank, setFilterRank] = React.useState<string>("");

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: !!isAuthenticated && !!isAdmin,
  });

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin", "category-keywords", filterCategory || null, filterRank || null],
    queryFn: () =>
      adminApi.getCategoryKeywords(
        filterCategory || undefined,
        filterRank === "" ? undefined : parseInt(filterRank, 10)
      ),
    enabled: !!isAuthenticated && !!isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateCategoryKeywordRequest;
    }) => adminApi.updateCategoryKeyword(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "category-keywords"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateCategoryKeywordRequest) =>
      adminApi.createCategoryKeyword(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "category-keywords"] });
      queryClient.invalidateQueries({
        queryKey: ["admin", "keywords-available", addCategoryId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCategoryKeyword(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "category-keywords"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "keywords-available"] });
    },
  });

  const [addCategoryId, setAddCategoryId] = React.useState<string>("");
  const [addKeywordId, setAddKeywordId] = React.useState<string>("");
  const [addRank, setAddRank] = React.useState<1 | 2>(1);
  const [addParentKeywordId, setAddParentKeywordId] = React.useState<string>("");
  const [addSortRank, setAddSortRank] = React.useState<number>(0);
  const [addDescription, setAddDescription] = React.useState<string>("");

  const { data: availableKeywordsData } = useQuery({
    queryKey: ["admin", "keywords-available", addCategoryId],
    queryFn: () => adminApi.getAvailableKeywordsForCategory(addCategoryId),
    enabled: !!isAuthenticated && !!isAdmin && !!addCategoryId,
  });
  const availableKeywords = availableKeywordsData?.keywords ?? [];

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return (
      <ErrorMessage
        message="Failed to load category keywords"
        onRetry={() => refetch()}
      />
    );

  const keywords = data?.keywords ?? [];
  const categories = categoriesData?.categories ?? [];
  const rank1ByCategory = keywords.filter((kw) => kw.navigationRank === 1);

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
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Manage Keywords</h1>
      <p className="text-gray-600 text-sm mb-2">
        Assign keywords to a parent (rank-1) within each category. Rank 1 = top-level, Rank 2 = under a parent. &quot;Other&quot; is excluded from this list.
      </p>
      <p className="text-gray-500 text-sm mb-6">
        <strong>Navigation keywords</strong> are used in URL paths (e.g. <code className="bg-gray-100 px-1 rounded">/categories/act-math/Algebra</code>). Only rank-1 and rank-2 keywords appear in navigation and URLs.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="text-sm font-medium text-gray-700">
          Category
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="ml-2 rounded border-gray-300 text-sm"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.category}>
                {c.category}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Rank
          <select
            value={filterRank}
            onChange={(e) => setFilterRank(e.target.value)}
            className="ml-2 rounded border-gray-300 text-sm"
          >
            <option value="">All</option>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </label>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Add keyword to navigation</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-gray-700">
            Category
            <select
              value={addCategoryId}
              onChange={(e) => {
                setAddCategoryId(e.target.value);
                setAddKeywordId("");
                setAddParentKeywordId("");
              }}
              className="ml-2 rounded border border-gray-300 text-sm"
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.category}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Keyword
            <select
              value={addKeywordId}
              onChange={(e) => setAddKeywordId(e.target.value)}
              disabled={!addCategoryId || availableKeywords.length === 0}
              className="ml-2 rounded border border-gray-300 text-sm min-w-[140px]"
            >
              <option value="">Select keyword</option>
              {availableKeywords.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Rank
            <select
              value={addRank}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10) as 1 | 2;
                setAddRank(v);
                if (v === 1) setAddParentName("");
              }}
              className="ml-2 rounded border border-gray-300 text-sm"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
          {addRank === 2 && (
            <label className="text-sm font-medium text-gray-700">
              Parent (rank-1)
              <select
                value={addParentKeywordId}
                onChange={(e) => setAddParentKeywordId(e.target.value)}
                className="ml-2 rounded border border-gray-300 text-sm min-w-[120px]"
              >
                <option value="">Select parent</option>
                {rank1ByCategory
                  .filter(
                    (r) =>
                      categories.find((c) => c.id === addCategoryId)?.category ===
                      r.categoryName
                  )
                  .map((r) => (
                    <option key={r.keywordId} value={r.keywordId}>
                      {r.keywordName}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="text-sm font-medium text-gray-700">
            Sort
            <input
              type="number"
              min={0}
              value={addSortRank}
              onChange={(e) => setAddSortRank(parseInt(e.target.value, 10) || 0)}
              className="ml-2 w-16 rounded border border-gray-300 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Description
            <input
              type="text"
              value={addDescription}
              onChange={(e) => setAddDescription(e.target.value)}
              placeholder="Optional"
              className="ml-2 rounded border border-gray-300 text-sm w-40"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (!addCategoryId || !addKeywordId) return;
              if (addRank === 2 && !addParentKeywordId) return;
              createMutation.mutate({
                categoryId: addCategoryId,
                childKeywordId: addKeywordId,
                parentKeywordId: addRank === 2 ? addParentKeywordId : null,
                sortRank: addSortRank,
                description: addDescription.trim() || null,
              });
              setAddKeywordId("");
              setAddParentKeywordId("");
              setAddSortRank(0);
              setAddDescription("");
            }}
            disabled={
              !addCategoryId ||
              !addKeywordId ||
              (addRank === 2 && !addParentKeywordId) ||
              createMutation.isPending
            }
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMutation.isPending ? "Adding…" : "Add"}
          </button>
        </div>
        {createMutation.isError && (
          <p className="mt-2 text-sm text-red-600">
            {createMutation.error instanceof Error
              ? createMutation.error.message
              : "Failed to add keyword"}
          </p>
        )}
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Keyword
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Description
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Rank
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Parent
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Sort
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {keywords
                .sort(
                  (a, b) =>
                    a.categoryName.localeCompare(b.categoryName) ||
                    a.sortRank - b.sortRank ||
                    a.keywordName.localeCompare(b.keywordName)
                )
                .map((kw) => (
                  <KeywordRow
                    key={kw.id}
                    keyword={kw}
                    description={kw.description ?? ""}
                    rank1Options={rank1ByCategory
                      .filter(
                        (r) =>
                          r.categoryName === kw.categoryName &&
                          r.keywordName !== kw.keywordName
                      )
                      .map((r) => ({ keywordName: r.keywordName, keywordId: r.keywordId }))}
                    onSave={(body) => updateMutation.mutate({ id: kw.id, body })}
                    isSaving={updateMutation.isPending}
                    onDelete={() => deleteMutation.mutate(kw.id)}
                    isDeleting={deleteMutation.isPending}
                  />
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {keywords.length === 0 && (
        <p className="text-gray-500 text-center py-8">No category keywords found.</p>
      )}
    </div>
  );
};

function KeywordRow({
  keyword,
  description,
  rank1Options,
  onSave,
  isSaving,
  onDelete,
  isDeleting,
}: {
  keyword: CategoryKeywordAdminResponse;
  description: string;
  rank1Options: { keywordName: string; keywordId: string }[];
  onSave: (body: UpdateCategoryKeywordRequest) => void;
  isSaving: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const initialParentId =
    keyword.parentName && keyword.navigationRank === 2
      ? rank1Options.find((o) => o.keywordName === keyword.parentName)?.keywordId ?? ""
      : "";
  const [parentKeywordId, setParentKeywordId] = React.useState<string>(initialParentId);
  const [sortRank, setSortRank] = React.useState<number | "">(keyword.sortRank);
  const [descValue, setDescValue] = React.useState(description);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    const nextParentId =
      keyword.parentName && keyword.navigationRank === 2
        ? rank1Options.find((o) => o.keywordName === keyword.parentName)?.keywordId ?? ""
        : "";
    setParentKeywordId(nextParentId);
    setSortRank(keyword.sortRank);
    setDescValue(description);
  }, [keyword.id, keyword.parentName, keyword.navigationRank, keyword.sortRank, description, rank1Options]);

  const handleParentChange = (value: string) => {
    setParentKeywordId(value);
    setDirty(true);
  };

  const handleSortChange = (value: string) => {
    setSortRank(value === "" ? "" : parseInt(value, 10));
    setDirty(true);
  };

  const handleDescChange = (value: string) => {
    setDescValue(value);
    setDirty(true);
  };

  const handleSave = () => {
    const body: UpdateCategoryKeywordRequest = {};
    const currentParentId = keyword.parentName && keyword.navigationRank === 2
      ? rank1Options.find((o) => o.keywordName === keyword.parentName)?.keywordId ?? null
      : null;
    if (currentParentId !== (parentKeywordId || null)) body.parentKeywordId = parentKeywordId || null;
    if (keyword.sortRank !== (sortRank === "" ? keyword.sortRank : sortRank))
      body.sortRank = sortRank === "" ? undefined : sortRank;
    if ((keyword.description ?? "") !== descValue.trim()) body.description = descValue.trim() || null;
    if (Object.keys(body).length === 0) return;
    onSave(body);
    setDirty(false);
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2 text-sm text-gray-900">{keyword.categoryName}</td>
      <td className="px-4 py-2 text-sm font-medium text-gray-900">
        {keyword.keywordName}
      </td>
      <td className="px-4 py-2 max-w-[200px]">
        <input
          type="text"
          value={descValue}
          onChange={(e) => handleDescChange(e.target.value)}
          placeholder="Optional description"
          className="w-full rounded border-gray-300 text-sm"
        />
      </td>
      <td className="px-4 py-2 text-sm text-gray-900">
        {keyword.navigationRank === 1 ? "1" : "2"}
      </td>
      <td className="px-4 py-2">
        <select
          value={parentKeywordId}
          onChange={(e) => handleParentChange(e.target.value)}
          className="rounded border-gray-300 text-sm min-w-[120px]"
          disabled={keyword.navigationRank === 1}
        >
          <option value="">None</option>
          {rank1Options.map((o) => (
            <option key={o.keywordId} value={o.keywordId}>
              {o.keywordName}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          min={0}
          value={sortRank === "" ? "" : sortRank}
          onChange={(e) => handleSortChange(e.target.value)}
          className="w-16 rounded border-gray-300 text-sm"
        />
      </td>
      <td className="px-4 py-2 text-right space-x-2">
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                `Remove "${keyword.keywordName}" from navigation in ${keyword.categoryName}? The keyword will still exist as a tag.`
              )
            ) {
              onDelete();
            }
          }}
          disabled={isDeleting}
          className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
          title="Remove from navigation"
        >
          {isDeleting ? "…" : "Delete"}
        </button>
      </td>
    </tr>
  );
}

export default AdminKeywordsPage;
