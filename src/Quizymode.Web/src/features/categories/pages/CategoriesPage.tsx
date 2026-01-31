import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams, useParams, Link } from "react-router-dom";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { itemsApi } from "@/api/items";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import ItemListSection from "@/components/ItemListSection";
import BulkItemCollectionsModal from "@/components/BulkItemCollectionsModal";
import useItemSelection from "@/hooks/useItemSelection";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSize } from "@/hooks/usePageSize";
import { SEO } from "@/components/SEO";
import {
  categoryNameToSlug,
  findCategoryNameFromSlug,
  buildCategoryPath,
  parseKeywordSegment,
} from "@/utils/categorySlug";
import {
  AcademicCapIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  Squares2X2Icon,
  PlusIcon,
  ChevronRightIcon as BreadcrumbChevron,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

type SortOption = "name" | "rating" | "count";

const CATEGORIES_PER_PAGE = 30;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const CategoriesPage = () => {
  const { isAuthenticated } = useAuth();
  const { category: categorySlugParam, kw1: kw1Param, kw2: kw2Param } = useParams<{
    category?: string;
    kw1?: string;
    kw2?: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");

  const viewFromUrl = searchParams.get("view") || "sets";
  const pageFromUrl = parseInt(searchParams.get("page") || "1", 10);
  const pageSizeFromUrl = parseInt(searchParams.get("pagesize") || "10", 10);
  const sortFromUrl = (searchParams.get("sort") || "rating") as SortOption;
  const categoriesPageFromUrl = parseInt(
    searchParams.get("categoriesPage") || "1",
    10
  );

  const [categoriesPage, setCategoriesPage] = useState(categoriesPageFromUrl);
  const [itemsPage, setItemsPage] = useState(pageFromUrl);
  const [selectedItemsForBulkCollections, setSelectedItemsForBulkCollections] =
    useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>(sortFromUrl);
  const { pageSize: userPageSize } = usePageSize();
  const pageSize =
    pageSizeFromUrl !== 10 ? pageSizeFromUrl : userPageSize;
  const view = viewFromUrl === "items" ? "items" : "sets";
  const navigate = useNavigate();

  const keywordsFromUrl = useMemo(() => {
    const kws: string[] = [];
    if (kw1Param) kws.push(parseKeywordSegment(kw1Param));
    if (kw2Param) kws.push(parseKeywordSegment(kw2Param));
    return kws;
  }, [kw1Param, kw2Param]);

  const { data: categoriesData, isLoading, error, refetch } = useQuery({
    queryKey: ["categories", search],
    queryFn: () => categoriesApi.getAll(search || undefined),
  });

  const categoryName = useMemo(() => {
    if (!categorySlugParam || !categoriesData?.categories) return null;
    const names = categoriesData.categories.map((c) => c.category);
    return findCategoryNameFromSlug(categorySlugParam, names);
  }, [categorySlugParam, categoriesData?.categories]);

  const { data: keywordsData, isLoading: isLoadingKeywords } = useQuery({
    queryKey: ["keywords", categoryName, keywordsFromUrl],
    queryFn: () =>
      keywordsApi.getNavigationKeywords(
        categoryName!,
        keywordsFromUrl.length > 0 ? keywordsFromUrl : undefined
      ),
    enabled: !!categoryName && view === "sets",
  });

  const tagFromUrl = searchParams.get("tag") || undefined;
  const keywordsForItems = useMemo(
    () => (tagFromUrl ? [...keywordsFromUrl, tagFromUrl] : keywordsFromUrl),
    [keywordsFromUrl, tagFromUrl]
  );

  const isLeaf = !!categoryName && keywordsFromUrl.length >= 2;

  const { data: itemsData, isLoading: isLoadingItems, error: itemsError, refetch: refetchItems } = useQuery({
    queryKey: ["categoryItems", categoryName, keywordsForItems, itemsPage, pageSize],
    queryFn: () =>
      itemsApi.getAll(
        categoryName || undefined,
        undefined,
        keywordsForItems.length > 0 ? keywordsForItems : undefined,
        undefined,
        undefined,
        itemsPage,
        pageSize
      ),
    enabled: !!categoryName && view === "items",
  });

  const currentPageItemIds = (itemsData?.items || []).map((item) => item.id);
  const { selectedItemIds, selectedIds, toggleItem, selectAll, deselectAll } =
    useItemSelection(currentPageItemIds, [itemsPage, categoryName, view]);

  useEffect(() => {
    if (!categorySlugParam && categoriesPage !== 1) {
      setCategoriesPage(1);
      const p = new URLSearchParams(searchParams);
      p.set("categoriesPage", "1");
      setSearchParams(p, { replace: true });
    }
  }, [search]);

  useEffect(() => {
    setSortBy(sortFromUrl);
    setCategoriesPage(categoriesPageFromUrl);
    setItemsPage(pageFromUrl);
  }, [sortFromUrl, categoriesPageFromUrl, pageFromUrl]);

  const sortedAndPaginatedCategories = useMemo(() => {
    if (!categoriesData?.categories)
      return { categories: [], totalCount: 0, totalPages: 0, startIndex: 0, endIndex: 0 };
    const sorted = [...categoriesData.categories].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.category.localeCompare(b.category);
        case "rating":
          const aR = a.averageStars ?? -1;
          const bR = b.averageStars ?? -1;
          if (aR !== bR) return bR - aR;
          return a.category.localeCompare(b.category);
        case "count":
          if (a.count !== b.count) return b.count - a.count;
          return a.category.localeCompare(b.category);
        default:
          return 0;
      }
    });
    const totalCount = sorted.length;
    const totalPages = Math.ceil(totalCount / CATEGORIES_PER_PAGE);
    const startIndex = (categoriesPage - 1) * CATEGORIES_PER_PAGE;
    const endIndex = startIndex + CATEGORIES_PER_PAGE;
    return {
      categories: sorted.slice(startIndex, endIndex),
      totalCount,
      totalPages,
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, totalCount),
    };
  }, [categoriesData?.categories, sortBy, categoriesPage]);

  const sortedKeywords = useMemo(() => {
    if (!keywordsData?.keywords) return [];
    const pathKwLower = new Set(keywordsFromUrl.map((k) => k.toLowerCase()));
    const filtered = keywordsData.keywords.filter(
      (kw) => !pathKwLower.has(kw.name.toLowerCase())
    );
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "rating":
          const aR = a.averageRating ?? -1;
          const bR = b.averageRating ?? -1;
          if (aR !== bR) return bR - aR;
          return a.name.localeCompare(b.name);
        case "count":
          if (a.itemCount !== b.itemCount) return b.itemCount - a.itemCount;
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [keywordsData?.keywords, keywordsFromUrl, sortBy]);

  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort);
    setCategoriesPage(1);
    const p = new URLSearchParams(searchParams);
    p.set("sort", newSort);
    p.set("categoriesPage", "1");
    setSearchParams(p);
  };

  const handleCategoriesPageChange = (newPage: number) => {
    setCategoriesPage(newPage);
    const p = new URLSearchParams(searchParams);
    p.set("categoriesPage", newPage.toString());
    setSearchParams(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const navigateToSets = (path: string) => {
    const p = new URLSearchParams(searchParams);
    p.set("view", "sets");
    p.delete("page");
    p.delete("pagesize");
    navigate(`${path}?${p.toString()}`);
  };

  const navigateToItems = (path: string, resetPage = true, tag?: string) => {
    const p = new URLSearchParams(searchParams);
    p.set("view", "items");
    if (resetPage) p.set("page", "1");
    p.set("pagesize", pageSize.toString());
    if (tag) p.set("tag", tag);
    else p.delete("tag");
    navigate(`${path}?${p.toString()}`);
  };

  const dedupeKeywords = (kws: string[]) => {
    const seen = new Set<string>();
    return kws.filter((k) => {
      const lower = k.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
  };

  const navigateToExplore = (pathCategorySlug: string, kws: string[]) => {
    const base = `/explore/${pathCategorySlug}`;
    const deduped = dedupeKeywords(kws);
    if (deduped.length > 0) {
      navigate(`${base}?keywords=${deduped.join(",")}`);
    } else {
      navigate(base);
    }
  };

  const navigateToQuiz = (pathCategorySlug: string, kws: string[]) => {
    const base = `/quiz/${pathCategorySlug}`;
    const deduped = dedupeKeywords(kws);
    if (deduped.length > 0) {
      navigate(`${base}?keywords=${deduped.join(",")}`);
    } else {
      navigate(base);
    }
  };

  const handleKeywordClick = (keyword: string) => {
    const newKeywords = [...keywordsFromUrl, keyword];
    const path = buildCategoryPath(
      categoryNameToSlug(categoryName!),
      newKeywords
    );
    navigateToSets(path);
  };

  const handlePageChange = (newPage: number) => {
    setItemsPage(newPage);
    if (categoryName) {
      const path = buildCategoryPath(
        categoryNameToSlug(categoryName),
        keywordsFromUrl
      );
      const p = new URLSearchParams(searchParams);
      p.set("view", "items");
      p.set("page", newPage.toString());
      p.set("pagesize", pageSize.toString());
      navigate(`${path}?${p.toString()}`);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    if (categoryName) {
      const path = buildCategoryPath(
        categoryNameToSlug(categoryName),
        keywordsFromUrl
      );
      const p = new URLSearchParams(searchParams);
      p.set("view", "items");
      p.set("page", "1");
      p.set("pagesize", newSize.toString());
      navigate(`${path}?${p.toString()}`);
    }
  };

  const handleAddSelectedToCollection = () => {
    if (selectedIds.length > 0) setSelectedItemsForBulkCollections(selectedIds);
  };

  const listItemsReturnUrl = categoryName
    ? `${buildCategoryPath(categoryNameToSlug(categoryName), keywordsFromUrl)}?view=items&page=${itemsPage}&pagesize=${pageSize}${tagFromUrl ? `&tag=${encodeURIComponent(tagFromUrl)}` : ""}`
    : undefined;

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return (
      <ErrorMessage message="Failed to load categories" onRetry={() => refetch()} />
    );

  if (categorySlugParam && !categoryName && categoriesData?.categories) {
    return (
      <div className="px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <p className="text-gray-600 mb-4">Category not found.</p>
          <Link
            to="/categories"
            className="text-indigo-600 hover:text-indigo-800"
          >
            ← Back to Categories
          </Link>
        </div>
      </div>
    );
  }

  if (categoryName && view === "items") {
    if (isLoadingItems) return <LoadingSpinner />;
    if (itemsError)
      return (
        <ErrorMessage message="Failed to load items" onRetry={() => refetchItems()} />
      );

    return (
      <>
        <SEO
          title={`${categoryName} Category`}
          description={`Browse items in the ${categoryName} category on Quizymode.`}
          canonical={`https://www.quizymode.com${buildCategoryPath(categoryNameToSlug(categoryName), keywordsFromUrl)}`}
        />
        <div className="px-4 py-6 sm:px-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
            <Breadcrumb
              categoryName={categoryName}
              keywords={keywordsFromUrl}
              onNavigate={navigateToSets}
            />
            <div className="flex items-center gap-2 flex-shrink-0 flex-nowrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Per page:</label>
                  <select
                    value={pageSize}
                    onChange={(e) =>
                      handlePageSizeChange(parseInt(e.target.value, 10))
                    }
                    className="rounded border-gray-300 text-sm"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() =>
                    navigateToExplore(
                      categoryNameToSlug(categoryName),
                      keywordsFromUrl
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
                >
                  <MagnifyingGlassIcon className="h-4 w-4" />
                  Explore
                </button>
                <button
                  onClick={() =>
                    navigateToQuiz(
                      categoryNameToSlug(categoryName),
                      keywordsFromUrl
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-purple-600 bg-purple-50 rounded-md hover:bg-purple-100"
                >
                  <AcademicCapIcon className="h-4 w-4" />
                  Quiz
                </button>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-6">
              Items
            </h1>
            <p className="text-gray-600 text-sm mb-6">
              {keywordsForItems.length > 0
                ? `Items in ${categoryName} / ${keywordsForItems.join(" / ")}`
                : `All items in ${categoryName}`}
            </p>

            {itemsData?.items && itemsData.items.length > 0 ? (
              <ItemListSection
                items={itemsData.items}
                totalCount={itemsData.totalCount}
                page={itemsPage}
                totalPages={itemsData.totalPages}
                selectedItemIds={selectedItemIds}
                onPrevPage={() => handlePageChange(Math.max(1, itemsPage - 1))}
                onNextPage={() =>
                  handlePageChange(Math.min(itemsData.totalPages, itemsPage + 1))
                }
                onSelectAll={selectAll}
                onDeselectAll={deselectAll}
                onAddSelectedToCollection={handleAddSelectedToCollection}
                onToggleSelect={toggleItem}
                isAuthenticated={isAuthenticated}
                showRatingsAndComments
                returnUrl={listItemsReturnUrl}
                onKeywordClick={(keywordName) => {
                  const pathKwLower = new Set(
                    keywordsForItems.map((k) => k.toLowerCase())
                  );
                  const newKeywords = pathKwLower.has(keywordName.toLowerCase())
                    ? keywordsForItems
                    : [...keywordsForItems, keywordName];
                  const params = new URLSearchParams();
                  params.set("category", categoryName);
                  if (newKeywords.length > 0) {
                    params.set("keywords", dedupeKeywords(newKeywords).join(","));
                  }
                  navigate(`/my-items?${params.toString()}`);
                }}
                selectedKeywords={keywordsForItems}
                renderActions={(item) => (
                  <button
                    onClick={() => {
                      navigate(
                        `/explore/item/${item.id}?return=${encodeURIComponent(listItemsReturnUrl || "/categories")}`
                      );
                    }}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md"
                    title="View item details"
                  >
                    <EyeIcon className="h-5 w-5" />
                  </button>
                )}
              />
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">No items found.</p>
              </div>
            )}
          <BulkItemCollectionsModal
            itemIds={selectedItemsForBulkCollections}
            onCloseComplete={() => {
              setSelectedItemsForBulkCollections([]);
              deselectAll();
            }}
          />
        </div>
      </>
    );
  }

  if (categoryName && view === "sets") {
    if (isLoadingKeywords) return <LoadingSpinner />;

    return (
      <>
        <SEO
          title={`${categoryName} - Sets`}
          description={`Browse sets in the ${categoryName} category on Quizymode.`}
          canonical={`https://www.quizymode.com${buildCategoryPath(categoryNameToSlug(categoryName), keywordsFromUrl)}`}
        />
        <div className="px-4 py-6 sm:px-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
            <Breadcrumb
              categoryName={categoryName}
              keywords={keywordsFromUrl}
              onNavigate={navigateToSets}
            />
            <div className="flex items-center gap-2 flex-shrink-0 flex-nowrap">
              <SortControl sortBy={sortBy} onSortChange={handleSortChange} />
                {keywordsFromUrl.length >= 2 && isAuthenticated && (
                  <button
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.set("category", categoryName);
                      if (keywordsFromUrl.length > 0) {
                        params.set("keywords", keywordsFromUrl.join(","));
                      }
                      navigate(`/items/add?${params.toString()}`);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                    title="Add items"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add
                  </button>
                )}
                <ActionButtons
                  onListSets={undefined}
                  onListItems={() =>
                    navigateToItems(
                      buildCategoryPath(
                        categoryNameToSlug(categoryName),
                        keywordsFromUrl
                      )
                    )
                  }
                  onExplore={() =>
                    navigateToExplore(
                      categoryNameToSlug(categoryName),
                      keywordsFromUrl
                    )
                  }
                  onQuiz={() =>
                    navigateToQuiz(
                      categoryNameToSlug(categoryName),
                      keywordsFromUrl
                    )
                  }
                />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-6">
            {keywordsFromUrl.length === 0
              ? categoryName
              : keywordsFromUrl.join(" / ")}
          </h1>

          {sortedKeywords.length > 0 ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedKeywords.map((kw) => (
                    <CategoryOrKeywordBox
                      key={kw.name}
                      name={kw.name}
                      description={kw.description ?? undefined}
                      itemCount={kw.itemCount}
                      averageRating={kw.averageRating}
                      onClick={() =>
                        isLeaf
                          ? navigateToItems(
                              buildCategoryPath(
                                categoryNameToSlug(categoryName),
                                keywordsFromUrl
                              ),
                              true,
                              kw.name
                            )
                          : handleKeywordClick(kw.name)
                      }
                      onListSets={
                        isLeaf
                          ? undefined
                          : (e) => {
                              e.stopPropagation();
                              handleKeywordClick(kw.name);
                            }
                      }
                      onListItems={(e) => {
                        e.stopPropagation();
                        if (isLeaf) {
                          navigateToItems(
                            buildCategoryPath(
                              categoryNameToSlug(categoryName),
                              keywordsFromUrl
                            ),
                            true,
                            kw.name
                          );
                        } else {
                          const pathKwLower = new Set(
                            keywordsFromUrl.map((k) => k.toLowerCase())
                          );
                          const newKw =
                            pathKwLower.has(kw.name.toLowerCase())
                              ? keywordsFromUrl
                              : [...keywordsFromUrl, kw.name];
                          navigateToItems(
                            buildCategoryPath(
                              categoryNameToSlug(categoryName),
                              dedupeKeywords(newKw)
                            )
                          );
                        }
                      }}
                      onExplore={(e) => {
                        e.stopPropagation();
                        const pathKwLower = new Set(
                          keywordsFromUrl.map((k) => k.toLowerCase())
                        );
                        const newKw =
                          pathKwLower.has(kw.name.toLowerCase())
                            ? keywordsFromUrl
                            : [...keywordsFromUrl, kw.name];
                        navigateToExplore(
                          categoryNameToSlug(categoryName),
                          newKw
                        );
                      }}
                      onQuiz={(e) => {
                        e.stopPropagation();
                        const pathKwLower = new Set(
                          keywordsFromUrl.map((k) => k.toLowerCase())
                        );
                        const newKw =
                          pathKwLower.has(kw.name.toLowerCase())
                            ? keywordsFromUrl
                            : [...keywordsFromUrl, kw.name];
                        navigateToQuiz(
                          categoryNameToSlug(categoryName),
                          newKw
                        );
                      }}
                    />
                  ))}
                </div>
              </>
            ) : isLeaf ? (
              <div className="mb-6">
                <p className="text-gray-600 mb-4">
                  You&apos;ve reached the end of the sets hierarchy. Browse items, explore, or quiz.
                </p>
                <div className="flex flex-wrap gap-2">
                  <ActionButtons
                    onListSets={undefined}
                    onListItems={() =>
                      navigateToItems(
                        buildCategoryPath(
                          categoryNameToSlug(categoryName),
                          keywordsFromUrl
                        )
                      )
                    }
                    onExplore={() =>
                      navigateToExplore(
                        categoryNameToSlug(categoryName),
                        keywordsFromUrl
                      )
                    }
                    onQuiz={() =>
                      navigateToQuiz(
                        categoryNameToSlug(categoryName),
                        keywordsFromUrl
                      )
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">No sets in this level.</p>
                <ActionButtons
                  onListSets={undefined}
                  onListItems={() =>
                    navigateToItems(
                      buildCategoryPath(
                        categoryNameToSlug(categoryName),
                        keywordsFromUrl
                      )
                    )
                  }
                  onExplore={() =>
                    navigateToExplore(
                      categoryNameToSlug(categoryName),
                      keywordsFromUrl
                    )
                  }
                  onQuiz={() =>
                    navigateToQuiz(
                      categoryNameToSlug(categoryName),
                      keywordsFromUrl
                    )
                  }
                />
              </div>
            )}
        </div>
      </>
    );
  }

  return (
    <>
      <SEO
        title="Categories"
        description="Browse all categories on Quizymode. Find flashcards and quizzes organized by topic."
        canonical="https://www.quizymode.com/categories"
      />
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Categories</h1>
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="max-w-md">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-2 pr-10 border"
                />
                {search.trim().length > 0 && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                    aria-label="Clear search"
                    type="button"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <SortControl sortBy={sortBy} onSortChange={handleSortChange} />
          </div>
          {sortedAndPaginatedCategories.totalCount > 0 && (
            <div className="text-sm text-gray-600 mb-4">
              Showing {sortedAndPaginatedCategories.startIndex}-
              {sortedAndPaginatedCategories.endIndex} of{" "}
              {sortedAndPaginatedCategories.totalCount} categories
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedAndPaginatedCategories.categories.map((cat) => (
            <CategoryOrKeywordBox
              key={cat.category}
              name={cat.category}
              description={cat.description ?? undefined}
              itemCount={cat.count}
              averageRating={cat.averageStars}
              isPrivate={cat.isPrivate}
              onClick={() =>
                navigateToSets(
                  `/categories/${categoryNameToSlug(cat.category)}`
                )
              }
              onListSets={(e) => {
                e.stopPropagation();
                navigateToSets(`/categories/${categoryNameToSlug(cat.category)}`);
              }}
              onListItems={(e) => {
                e.stopPropagation();
                navigateToItems(`/categories/${categoryNameToSlug(cat.category)}`);
              }}
              onExplore={(e) => {
                e.stopPropagation();
                navigateToExplore(categoryNameToSlug(cat.category), []);
              }}
              onQuiz={(e) => {
                e.stopPropagation();
                navigateToQuiz(categoryNameToSlug(cat.category), []);
              }}
            />
          ))}
        </div>

        {sortedAndPaginatedCategories.categories.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No categories found.</p>
          </div>
        )}

        {sortedAndPaginatedCategories.totalPages > 1 && (
          <Pagination
            currentPage={categoriesPage}
            totalPages={sortedAndPaginatedCategories.totalPages}
            onPageChange={handleCategoriesPageChange}
          />
        )}
      </div>
    </>
  );
};

function Breadcrumb({
  categoryName,
  keywords,
  onNavigate,
}: {
  categoryName: string;
  keywords: string[];
  onNavigate: (path: string) => void;
}) {
  const slugs = [categoryNameToSlug(categoryName)];
  const pathSegments: { label: string; path: string }[] = [
    { label: categoryName, path: buildCategoryPath(slugs[0]) },
  ];
  keywords.forEach((kw, i) => {
    slugs.push(kw.toLowerCase().replace(/\s+/g, "-"));
    pathSegments.push({
      label: kw,
      path: buildCategoryPath(slugs[0], keywords.slice(0, i + 1)),
    });
  });

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-600">
      <Link
        to="/categories"
        className="text-indigo-600 hover:text-indigo-800"
      >
        Categories
      </Link>
      {pathSegments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          <BreadcrumbChevron className="h-4 w-4 text-gray-400" />
          <button
            onClick={() => onNavigate(seg.path)}
            className="text-indigo-600 hover:text-indigo-800"
          >
            {seg.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

function SortControl({
  sortBy,
  onSortChange,
}: {
  sortBy: SortOption;
  onSortChange: (s: SortOption) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-select" className="text-sm font-medium text-gray-700">
        Sort by:
      </label>
      <select
        id="sort-select"
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
      >
        <option value="name">Name</option>
        <option value="count">Number of Items</option>
        <option value="rating">Avg. Rating</option>
      </select>
    </div>
  );
}

function ActionButtons({
  onListSets,
  onListItems,
  onExplore,
  onQuiz,
}: {
  onListSets?: () => void;
  onListItems: () => void;
  onExplore: () => void;
  onQuiz: () => void;
}) {
  return (
    <>
      {onListSets && (
        <button
          onClick={onListSets}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
        >
          <Squares2X2Icon className="h-4 w-4" />
          List sets
        </button>
      )}
      <button
        onClick={onListItems}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-md hover:bg-emerald-100"
      >
        <ListBulletIcon className="h-4 w-4" />
        List items
      </button>
      <button
        onClick={onExplore}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
      >
        <MagnifyingGlassIcon className="h-4 w-4" />
        Explore mode
      </button>
      <button
        onClick={onQuiz}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-purple-600 bg-purple-50 rounded-md hover:bg-purple-100"
      >
        <AcademicCapIcon className="h-4 w-4" />
        Quiz mode
      </button>
    </>
  );
}

function CategoryOrKeywordBox({
  name,
  description,
  itemCount,
  averageRating,
  isPrivate,
  onClick,
  onListSets,
  onListItems,
  onExplore,
  onQuiz,
}: {
  name: string;
  description?: string | null;
  itemCount: number;
  averageRating: number | null;
  isPrivate?: boolean;
  onClick: () => void;
  onListSets?: (e: React.MouseEvent) => void;
  onListItems: (e: React.MouseEvent) => void;
  onExplore: (e: React.MouseEvent) => void;
  onQuiz: (e: React.MouseEvent) => void;
}) {
  const linkClass = "inline-flex items-center gap-1 text-xs font-medium hover:underline";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow p-6 text-left cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-medium text-gray-900">{name}</h3>
            {isPrivate !== undefined && (
              <span
                className={`px-2 py-1 text-xs font-medium rounded ${
                  isPrivate
                    ? "bg-purple-100 text-purple-800"
                    : "bg-green-100 text-green-800"
                }`}
              >
                {isPrivate ? "Private" : "Public"}
              </span>
            )}
          </div>
          {description ? (
            <p className="mt-1 text-sm text-gray-600 line-clamp-2">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-sm text-gray-500">
          <span>{itemCount} items</span>
          {averageRating != null && (
            <div className="flex items-center gap-1 text-gray-600">
              <StarIconSolid className="h-4 w-4 text-yellow-400" />
              <span className="font-medium">{averageRating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>
      <div
        className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2 items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {onListSets ? (
          <>
            <button
              onClick={onListSets}
              className={`${linkClass} text-indigo-600`}
              type="button"
            >
              <Squares2X2Icon className="h-4 w-4" />
              Sets
            </button>
            <span className="text-gray-300">|</span>
          </>
        ) : null}
        <button onClick={onListItems} className={`${linkClass} text-emerald-600`} type="button">
          <ListBulletIcon className="h-4 w-4" />
          List
        </button>
        <span className="text-gray-300">|</span>
        <button onClick={onExplore} className={`${linkClass} text-indigo-600`} type="button">
          <MagnifyingGlassIcon className="h-4 w-4" />
          Explore
        </button>
        <span className="text-gray-300">|</span>
        <button onClick={onQuiz} className={`${linkClass} text-purple-600`} type="button">
          <AcademicCapIcon className="h-4 w-4" />
          Quiz
        </button>
      </div>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="mt-8 flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <p className="text-sm text-gray-700">
          Page <span className="font-medium">{currentPage}</span> of{" "}
          <span className="font-medium">{totalPages}</span>
        </p>
        <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(
              (p) =>
                p === 1 ||
                p === totalPages ||
                Math.abs(p - currentPage) <= 1
            )
            .map((p, idx, arr) => {
              const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
              return (
                <div key={p} className="flex items-center">
                  {showEllipsis && (
                    <span className="px-4 py-2 text-sm ring-1 ring-inset ring-gray-300">
                      ...
                    </span>
                  )}
                  <button
                    onClick={() => onPageChange(p)}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                      p === currentPage
                        ? "z-10 bg-indigo-600 text-white"
                        : "text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                </div>
              );
            })}
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </nav>
      </div>
    </div>
  );
}

export default CategoriesPage;
