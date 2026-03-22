import { useMemo, useCallback, useEffect, useRef, useState } from "react";
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
import { taxonomyApi } from "@/api/taxonomy";
import { ItemTopicScopeFields } from "@/components/items/ItemTopicScopeFields";
import {
  keywordsParamFromScope,
  parseKeywordsParam,
} from "@/utils/addItemsScopeUrl";
import { useExtraKeywordAutocompleteSource } from "@/hooks/useExtraKeywordAutocompleteSource";

const EXTRA_KEYWORD_AUTOCOMPLETE_LIMIT = 10;

const AddItemsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const keywordInputContainerRef = useRef<HTMLDivElement>(null);
  const listboxId = "add-hub-extra-keyword-listbox";

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

  const { data: taxonomyData } = useQuery({
    queryKey: ["taxonomy"],
    queryFn: () => taxonomyApi.getAll(),
    staleTime: 24 * 60 * 60 * 1000,
    enabled: isAuthenticated,
  });

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

  const selectedCategory = useMemo(
    () => taxonomyData?.categories.find((c) => c.slug === category),
    [taxonomyData, category]
  );

  const taxonomyExtraSlugs = useMemo(() => {
    const r1 = rank1.trim().toLowerCase();
    const r2 = rank2.trim().toLowerCase();
    return (selectedCategory?.allKeywordSlugs ?? []).filter(
      (slug) => slug.toLowerCase() !== r1 && slug.toLowerCase() !== r2
    );
  }, [selectedCategory, rank1, rank2]);

  const { extraKeywordAutocompleteSource, itemTagKeywordsLoading } =
    useExtraKeywordAutocompleteSource(category, taxonomyExtraSlugs, isAuthenticated);

  const extraSegments = useMemo(() => extrasJoined.split(","), [extrasJoined]);
  const extraInputEndsWithComma = useMemo(
    () => /,\s*$/.test(extrasJoined),
    [extrasJoined]
  );
  const committedExtraKeywords = useMemo(
    () =>
      (extraInputEndsWithComma ? extraSegments : extraSegments.slice(0, -1))
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    [extraSegments, extraInputEndsWithComma]
  );
  const extraKeywordPrefix = useMemo(() => {
    if (extraInputEndsWithComma) return "";
    return (extraSegments[extraSegments.length - 1] ?? "").trim().toLowerCase();
  }, [extraSegments, extraInputEndsWithComma]);

  const extraKeywordMatches = useMemo(() => {
    if (extraKeywordPrefix.length === 0) return [];
    const alreadyChosen = new Set(committedExtraKeywords);
    return extraKeywordAutocompleteSource
      .filter((name) => name.toLowerCase().startsWith(extraKeywordPrefix))
      .filter((name) => !alreadyChosen.has(name.toLowerCase()))
      .slice(0, EXTRA_KEYWORD_AUTOCOMPLETE_LIMIT);
  }, [
    extraKeywordPrefix,
    committedExtraKeywords,
    extraKeywordAutocompleteSource,
  ]);

  const activeHighlightIndex = useMemo(() => {
    if (extraKeywordMatches.length === 0) return -1;
    return highlightIndex >= 0 && highlightIndex < extraKeywordMatches.length ? highlightIndex : 0;
  }, [highlightIndex, extraKeywordMatches.length]);

  useEffect(() => {
    if (!suggestOpen) return;
    const onDocDown = (ev: MouseEvent) => {
      if (
        keywordInputContainerRef.current &&
        !keywordInputContainerRef.current.contains(ev.target as Node)
      ) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [suggestOpen]);

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

  const applySuggestedExtraKeyword = useCallback(
    (name: string) => {
      applyScopeToUrl({
        extrasText: [...committedExtraKeywords, name].join(", "),
      });
      setSuggestOpen(false);
      setHighlightIndex(-1);
    },
    [applyScopeToUrl, committedExtraKeywords]
  );

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    const kw = keywordsParamFromScope(rank1, rank2, extrasJoined);
    if (kw) params.set("keywords", kw);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const buildCreateUrl = () => `/add-new-item${buildQueryString()}`;
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
            <p className="text-xs text-gray-500 mb-2">
              Type to reuse existing tags for this category, or keep entering your own comma-separated
              labels.
            </p>
            {itemTagKeywordsLoading && category !== "" && (
              <p className="text-xs text-gray-500 mb-2" aria-live="polite">
                Loading keyword suggestions for this category...
              </p>
            )}
            <div ref={keywordInputContainerRef} className="relative">
              <input
                id="add-hub-extras"
                type="text"
                value={extrasJoined}
                onChange={(e) => {
                  applyScopeToUrl({ extrasText: e.target.value });
                  setSuggestOpen(true);
                }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setSuggestOpen(false), 120);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    if (extraKeywordMatches.length === 0) return;
                    e.preventDefault();
                    setSuggestOpen(true);
                    setHighlightIndex(
                      activeHighlightIndex < extraKeywordMatches.length - 1
                        ? activeHighlightIndex + 1
                        : activeHighlightIndex >= 0
                          ? activeHighlightIndex
                          : 0
                    );
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    if (extraKeywordMatches.length === 0) return;
                    e.preventDefault();
                    setSuggestOpen(true);
                    setHighlightIndex(activeHighlightIndex > 0 ? activeHighlightIndex - 1 : 0);
                    return;
                  }
                  if (e.key === "Escape") {
                    if (suggestOpen) {
                      e.preventDefault();
                      setSuggestOpen(false);
                    }
                    return;
                  }
                  if (
                    e.key === "Enter" &&
                    suggestOpen &&
                    activeHighlightIndex >= 0 &&
                    extraKeywordMatches[activeHighlightIndex]
                  ) {
                    e.preventDefault();
                    applySuggestedExtraKeyword(extraKeywordMatches[activeHighlightIndex]);
                  }
                }}
                placeholder="e.g. practice, exam-prep"
                autoComplete="off"
                role="combobox"
                aria-expanded={Boolean(suggestOpen && extraKeywordMatches.length > 0)}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={
                  suggestOpen && activeHighlightIndex >= 0 && extraKeywordMatches[activeHighlightIndex]
                    ? `${listboxId}-opt-${activeHighlightIndex}`
                    : undefined
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              />
              {suggestOpen && extraKeywordMatches.length > 0 && (
                <ul
                  id={listboxId}
                  role="listbox"
                  className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
                >
                  {extraKeywordMatches.map((name, index) => (
                    <li
                      key={name}
                      id={`${listboxId}-opt-${index}`}
                      role="option"
                      aria-selected={index === activeHighlightIndex}
                      className={`cursor-pointer px-3 py-2 ${
                        index === activeHighlightIndex ? "bg-indigo-50 text-indigo-900" : "text-gray-800"
                      }`}
                      onMouseEnter={() => setHighlightIndex(index)}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        applySuggestedExtraKeyword(name);
                      }}
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
