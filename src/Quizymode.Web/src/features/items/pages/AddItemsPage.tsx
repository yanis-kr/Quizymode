import { useMemo, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  PlusIcon,
  DocumentPlusIcon,
  ArrowUpTrayIcon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { ItemTopicScopeFields } from "@/components/items/ItemTopicScopeFields";
import {
  keywordsParamFromScope,
  parseKeywordsParam,
} from "@/utils/addItemsScopeUrl";

const AddItemsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const category = searchParams.get("category")?.trim() ?? "";
  const keywordsParam = searchParams.get("keywords");
  const { rank1, rank2, extrasJoined } = useMemo(
    () => parseKeywordsParam(keywordsParam),
    [keywordsParam]
  );

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: isAuthenticated,
  });
  const categories = categoriesData?.categories ?? [];

  const { data: rank1Data, isLoading: isLoadingRank1 } = useQuery({
    queryKey: ["keywords", "rank1", category],
    queryFn: () => keywordsApi.getNavigationKeywords(category, []),
    enabled: isAuthenticated && !!category,
  });
  const rank1Options = (rank1Data?.keywords ?? [])
    .filter((k) => k.name.toLowerCase() !== "other")
    .map((k) => k.name);

  const { data: rank2Data, isLoading: isLoadingRank2 } = useQuery({
    queryKey: ["keywords", "rank2", category, rank1],
    queryFn: () => keywordsApi.getNavigationKeywords(category, [rank1]),
    enabled: isAuthenticated && !!category && !!rank1.trim(),
  });
  const rank2Options = (rank2Data?.keywords ?? []).map((k) => k.name);

  const applyScopeToUrl = useCallback(
    (patch: {
      category?: string;
      rank1?: string;
      rank2?: string;
      extrasText?: string;
    }) => {
      const cat =
        patch.category !== undefined ? patch.category.trim() : category;
      const r1 = patch.rank1 !== undefined ? patch.rank1 : rank1;
      const r2 = patch.rank2 !== undefined ? patch.rank2 : rank2;
      const ext =
        patch.extrasText !== undefined ? patch.extrasText : extrasJoined;
      const params = new URLSearchParams();
      if (cat) params.set("category", cat);
      const kw = keywordsParamFromScope(r1, r2, ext);
      if (kw) params.set("keywords", kw);
      setSearchParams(params, { replace: true });
    },
    [category, rank1, rank2, extrasJoined, setSearchParams]
  );

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    const kw = keywordsParamFromScope(rank1, rank2, extrasJoined);
    if (kw) params.set("keywords", kw);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const buildCreateUrl = () => `/items/create${buildQueryString()}`;
  const buildBulkUrl = () => `/items/bulk-create${buildQueryString()}`;
  const buildStudyGuideImportUrl = () =>
    `/study-guide/import${buildQueryString()}`;

  const buildStudyGuideUrl = () => "/study-guide";

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Add Items</h1>
        <p className="text-gray-600 text-sm mb-6">
          Choose where new items should live, then pick how to add them. Your choices are kept in the
          address bar so links to single create, bulk create, and study-guide import stay in sync.
        </p>

        <section className="rounded-lg border border-gray-200 bg-slate-50/80 p-4 sm:p-5 space-y-4 mb-8">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Topic and tags</h2>
            <p className="mt-1 text-xs text-gray-500">
              Category and navigation topics match the create-item form. Optional extra tags become
              additional keywords when you open single or bulk create (same as{" "}
              <code className="text-xs bg-white px-1 rounded border">keywords</code> in the URL after
              rank 1 and rank 2).
            </p>
          </div>
          <ItemTopicScopeFields
            idPrefix="add-hub-scope"
            categories={categories}
            category={category}
            rank1={rank1}
            rank2={rank2}
            onScopeChange={(patch) =>
              applyScopeToUrl({
                category: patch.category,
                rank1: patch.rank1,
                rank2: patch.rank2,
              })
            }
            rank1Options={rank1Options}
            rank2Options={rank2Options}
            isLoadingRank1={isLoadingRank1}
            isLoadingRank2={isLoadingRank2}
          />
          <div className="pt-4 border-t border-gray-200/90">
            <label
              htmlFor="add-hub-extras"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Additional keywords (comma-separated, optional)
            </label>
            <input
              id="add-hub-extras"
              type="text"
              value={extrasJoined}
              onChange={(e) =>
                applyScopeToUrl({ extrasText: e.target.value })
              }
              placeholder="e.g. practice, exam-prep"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
            />
          </div>
        </section>

        <div className="flex flex-col sm:flex-row gap-4 flex-wrap mb-6">
          <button
            onClick={() => navigate(buildStudyGuideUrl())}
            className="flex items-center gap-3 px-6 py-4 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-left"
          >
            <BookOpenIcon className="h-8 w-8 flex-shrink-0" />
            <div>
              <span className="font-medium block">My Study Guide</span>
              <span className="text-sm text-slate-200">
                Paste or edit your study guide text to reuse when generating items.
              </span>
            </div>
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
          <button
            onClick={() => navigate(buildCreateUrl())}
            className="flex items-center gap-3 px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-left"
          >
            <PlusIcon className="h-8 w-8 flex-shrink-0" />
            <div>
              <span className="font-medium block">Create a New Item</span>
              <span className="text-sm text-indigo-100">
                Add a single quiz item with full control.
              </span>
            </div>
          </button>
          <button
            onClick={() => navigate(buildStudyGuideImportUrl())}
            className="flex items-center gap-3 px-6 py-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-left"
          >
            <DocumentPlusIcon className="h-8 w-8 flex-shrink-0" />
            <div>
              <span className="font-medium block">Create Items from Study Guide</span>
              <span className="text-sm text-emerald-100">
                Generate AI prompts from your study guide, paste JSON, validate, and import.
              </span>
            </div>
          </button>
          <button
            onClick={() => navigate(buildBulkUrl())}
            className="flex items-center gap-3 px-6 py-4 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-left"
          >
            <ArrowUpTrayIcon className="h-8 w-8 flex-shrink-0" />
            <div>
              <span className="font-medium block">Bulk Create Items (no Study Guide)</span>
              <span className="text-sm text-amber-100">
                Ask AI to generate questions for this scope and paste JSON.
              </span>
            </div>
          </button>
        </div>

        <p className="mt-8 text-xs text-gray-500">
          Bookmark or share:{" "}
          <Link
            to={`/items/add${buildQueryString()}`}
            className="text-indigo-600 hover:text-indigo-800 break-all"
          >
            /items/add{buildQueryString()}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default AddItemsPage;
