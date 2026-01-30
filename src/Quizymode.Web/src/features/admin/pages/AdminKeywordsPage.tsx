import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import {
  adminApi,
  type CategoryKeywordAdminResponse,
  type UpdateCategoryKeywordRequest,
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
      <p className="text-gray-600 text-sm mb-6">
        Assign keywords to a parent (rank-1) within each category. Rank 1 = top-level, Rank 2 = under a parent. &quot;Other&quot; is excluded from this list.
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
                    rank1Options={rank1ByCategory
                      .filter(
                        (r) =>
                          r.categoryName === kw.categoryName &&
                          r.keywordName !== kw.keywordName
                      )
                      .map((r) => r.keywordName)}
                    onSave={(body) => updateMutation.mutate({ id: kw.id, body })}
                    isSaving={updateMutation.isPending}
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
  rank1Options,
  onSave,
  isSaving,
}: {
  keyword: CategoryKeywordAdminResponse;
  rank1Options: string[];
  onSave: (body: UpdateCategoryKeywordRequest) => void;
  isSaving: boolean;
}) {
  const [parentName, setParentName] = React.useState<string>(keyword.parentName ?? "");
  const [navigationRank, setNavigationRank] = React.useState<number | "">(
    keyword.navigationRank ?? ""
  );
  const [sortRank, setSortRank] = React.useState<number | "">(keyword.sortRank);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setParentName(keyword.parentName ?? "");
    setNavigationRank(keyword.navigationRank ?? "");
    setSortRank(keyword.sortRank);
  }, [keyword.id, keyword.parentName, keyword.navigationRank, keyword.sortRank]);

  const handleParentChange = (value: string) => {
    setParentName(value);
    setDirty(true);
  };

  const handleRankChange = (value: string) => {
    const n = value === "" ? "" : parseInt(value, 10);
    setNavigationRank(n);
    if (n === 1) setParentName("");
    setDirty(true);
  };

  const handleSortChange = (value: string) => {
    setSortRank(value === "" ? "" : parseInt(value, 10));
    setDirty(true);
  };

  const handleSave = () => {
    const body: UpdateCategoryKeywordRequest = {};
    if (keyword.parentName !== (parentName || null)) body.parentName = parentName || null;
    if (keyword.navigationRank !== (navigationRank === "" ? null : navigationRank))
      body.navigationRank = navigationRank === "" ? null : navigationRank;
    if (keyword.sortRank !== (sortRank === "" ? keyword.sortRank : sortRank))
      body.sortRank = sortRank === "" ? undefined : sortRank;
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
      <td className="px-4 py-2">
        <select
          value={navigationRank === "" ? "" : navigationRank}
          onChange={(e) => handleRankChange(e.target.value)}
          className="rounded border-gray-300 text-sm"
        >
          <option value="">—</option>
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
      </td>
      <td className="px-4 py-2">
        <select
          value={parentName}
          onChange={(e) => handleParentChange(e.target.value)}
          className="rounded border-gray-300 text-sm min-w-[120px]"
          disabled={navigationRank === 1}
        >
          <option value="">None</option>
          {rank1Options.map((name) => (
            <option key={name} value={name}>
              {name}
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
      <td className="px-4 py-2 text-right">
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
      </td>
    </tr>
  );
}

export default AdminKeywordsPage;
