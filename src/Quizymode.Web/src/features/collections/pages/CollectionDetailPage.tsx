import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import ItemListSection from "@/components/ItemListSection";
import ItemCollectionsModal from "@/components/ItemCollectionsModal";
import { ItemCollectionControls } from "@/components/ItemCollectionControls";
import { ScopeSecondaryBar } from "@/components/ScopeSecondaryBar";
import { EyeIcon, MinusIcon, StarIcon, BookmarkIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { buildCategoryPath, categoryNameToSlug } from "@/utils/categorySlug";
import { buildCollectionPath, buildCollectionStudyPath } from "@/utils/collectionPath";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const CollectionDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const view = searchParams.get("view") || "list";
  const itemId = searchParams.get("item") || null;
  const { isAuthenticated, userId } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [manageCollectionsItemId, setManageCollectionsItemId] = useState<string | null>(null);
  const [itemsPage, setItemsPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showDetails, setShowDetails] = useState(false);

  const {
    data: collectionData,
    isLoading: isLoadingCollection,
    error: collectionError,
  } = useQuery({
    queryKey: ["collection", id],
    queryFn: () => collectionsApi.getById(id!),
    enabled: !!id,
  });

  const {
    data: itemsData,
    isLoading: isLoadingItems,
    error: itemsError,
  } = useQuery({
    queryKey: ["collectionItems", id],
    queryFn: () => collectionsApi.getItems(id!),
    enabled: !!id,
  });

  // Unified URL: redirect to explore/quiz routes when view param is set (keeps existing explore/quiz pages)
  useEffect(() => {
    if (!id) return;
    if ((view === "explore" || view === "quiz") && !collectionData?.name) return;
    if (view === "explore") {
      const path = buildCollectionStudyPath("explore", id, collectionData?.name, itemId);
      navigate(path, { replace: true });
    } else if (view === "quiz") {
      const path = buildCollectionStudyPath("quiz", id, collectionData?.name, itemId);
      navigate(path, { replace: true });
    }
  }, [id, view, itemId, navigate, collectionData?.name]);

  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) => collectionsApi.removeItem(id!, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collectionItems", id] });
      queryClient.invalidateQueries({ queryKey: ["collection", id] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const updateCollectionMutation = useMutation({
    mutationFn: (payload: { name?: string; description?: string | null; isPublic?: boolean }) =>
      collectionsApi.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", id] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const { data: ratingData } = useQuery({
    queryKey: ["collectionRating", id],
    queryFn: () => collectionsApi.getRating(id!),
    enabled: !!id,
  });

  const setRatingMutation = useMutation({
    mutationFn: (stars: number) => collectionsApi.setRating(id!, stars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collectionRating", id] });
    },
  });

  const isOwner = isAuthenticated && !!userId && collectionData?.createdBy === userId;

  const { data: bookmarkedByData } = useQuery({
    queryKey: ["collectionBookmarkedBy", id],
    queryFn: () => collectionsApi.getBookmarkedBy(id!),
    enabled: !!id && isOwner,
  });
  const allItems = itemsData?.items || [];

  const totalCount = allItems.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (itemsPage - 1) * pageSize;
    return allItems.slice(start, start + pageSize);
  }, [allItems, itemsPage, pageSize]);

  useEffect(() => {
    if (itemsPage > totalPages && totalPages >= 1) {
      setItemsPage(totalPages);
    }
  }, [itemsPage, totalPages]);

  const handlePageChange = (newPage: number) => {
    setItemsPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRemoveItem = (itemId: string) => {
    if (
      window.confirm(
        "Are you sure you want to remove this item from the collection?"
      )
    ) {
      removeItemMutation.mutate(itemId);
    }
  };

  const isLoading = isLoadingCollection || isLoadingItems;
  const error = collectionError || itemsError;

  if (isLoading) return <LoadingSpinner />;
  if (error)
    return (
      <ErrorMessage
        message="Failed to load collection"
        onRetry={() => window.location.reload()}
      />
    );

  // Redirecting to explore/quiz routes (unified URL entry)
  if (view === "explore" || view === "quiz") return <LoadingSpinner />;

  const collectionPath = id ? buildCollectionPath(id, collectionData?.name) : undefined;
  const collectionReturnUrl = collectionPath;

  return (
    <div className="px-4 py-6 sm:px-0">
      {allItems.length > 0 && (
        <ScopeSecondaryBar
          scopeType="collection"
          activeMode="list"
          availableModes={["list", "explore", "quiz"]}
          onModeChange={(mode) => {
            if (!id) return;
            if (mode === "explore") navigate(`${buildCollectionPath(id, collectionData?.name)}?view=explore`);
            else if (mode === "quiz") navigate(`${buildCollectionPath(id, collectionData?.name)}?view=quiz`);
          }}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-4 mb-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Collection
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <div className="text-lg font-semibold text-gray-900 truncate max-w-xs sm:max-w-sm md:max-w-md">
              {collectionData?.name ?? "Untitled collection"}
            </div>
            {collectionData?.description && collectionData.description.trim() !== "" && (
              <div className="text-sm text-gray-500 truncate max-w-xs sm:max-w-sm md:max-w-lg">
                {collectionData.description}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm text-gray-600">
            {collectionData?.itemCount ?? totalCount} items
          </div>
          {allItems.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Per page:</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10));
                  setItemsPage(1);
                }}
                className="rounded border-gray-300 text-sm"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Details
          </button>
        </div>
      </div>
      {isOwner && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Shared with others</span>
            <span className="text-sm text-gray-500">(anyone with the link can view and quiz; collection also appears in Discover search)</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={collectionData?.isPublic ?? false}
            onClick={() => {
              if (collectionData && !updateCollectionMutation.isPending) {
                updateCollectionMutation.mutate({
                  name: collectionData.name,
                  isPublic: !collectionData.isPublic,
                });
              }
            }}
            disabled={updateCollectionMutation.isPending}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 ${
              collectionData?.isPublic ? "bg-indigo-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                collectionData?.isPublic ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      )}
      {isOwner && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional, helps others find it)</label>
          <textarea
            key={collectionData?.description ?? "empty"}
            defaultValue={collectionData?.description ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (collectionData && v !== (collectionData.description ?? "") && !updateCollectionMutation.isPending)
                updateCollectionMutation.mutate({ description: v || null });
            }}
            placeholder="e.g. Biology chapter 5 practice set"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
      )}
      {isOwner && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <BookmarkIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">Bookmarked by</span>
              {bookmarkedByData && (
                <span className="text-xs text-gray-500">
                  {bookmarkedByData.bookmarkedBy.length} user
                  {bookmarkedByData.bookmarkedBy.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-gray-200">
            <span className="text-sm font-medium text-gray-700">Rating</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRatingMutation.mutate(star)}
                  disabled={setRatingMutation.isPending}
                  className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-50"
                  title={`Rate ${star} star${star > 1 ? "s" : ""}`}
                >
                  {ratingData?.myStars != null && star <= ratingData.myStars ? (
                    <StarIconSolid className="h-5 w-5 text-amber-500" />
                  ) : (
                    <StarIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              ))}
            </div>
            <span className="text-sm text-gray-500">
              {ratingData?.averageStars != null
                ? `${ratingData.averageStars} (${ratingData.count} rating${ratingData.count === 1 ? "" : "s"})`
                : "No ratings yet"}
            </span>
          </div>
          {bookmarkedByData && bookmarkedByData.bookmarkedBy.length > 0 ? (
            <ul className="text-sm text-gray-600 space-y-1">
              {bookmarkedByData.bookmarkedBy.map((b) => (
                <li key={b.userId}>
                  {b.name ?? b.userId} · {new Date(b.bookmarkedAt).toLocaleDateString()}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              No one has bookmarked this collection yet.
            </p>
          )}
        </div>
      )}
      {showDetails && collectionData && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-40"
          onClick={() => setShowDetails(false)}
        >
          <div
            className="relative top-24 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Collection details</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <dl className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-gray-600">Name</dt>
                <dd className="text-right break-words">{collectionData.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-gray-600">Author</dt>
                <dd className="text-right break-all">{collectionData.createdBy}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-gray-600">Created</dt>
                <dd className="text-right">
                  {new Date(collectionData.createdAt).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-gray-600">Items</dt>
                <dd className="text-right">{collectionData.itemCount}</dd>
              </div>
              {"isPublic" in collectionData && (
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-gray-600">Visibility</dt>
                  <dd className="text-right">
                    {collectionData.isPublic ? "Public" : "Private"}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}

      {paginatedItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No items in this collection.</p>
        </div>
      ) : (
        <ItemListSection
            items={paginatedItems}
            totalCount={totalCount}
            page={itemsPage}
            totalPages={totalPages}
            onPrevPage={() => handlePageChange(Math.max(1, itemsPage - 1))}
            onNextPage={() => handlePageChange(Math.min(totalPages, itemsPage + 1))}
            showRatingsAndComments
            returnUrl={collectionReturnUrl}
            onKeywordClick={(keywordName, item) => {
              if (!item?.category) return;
              const path = buildCategoryPath(
                categoryNameToSlug(item.category),
                [keywordName]
              );
              navigate(`${path}?view=items&page=1`);
            }}
            renderActions={(item) => (
              <>
                <Link
                  to={`/items/${item.id}`}
                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md inline-flex"
                  title="View item details"
                >
                  <EyeIcon className="h-5 w-5" />
                </Link>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-2 text-amber-600 hover:bg-amber-50 rounded-md"
                    title="Remove from collection"
                  >
                    <MinusIcon className="h-5 w-5" />
                  </button>
                )}
                {isAuthenticated && (
                  <ItemCollectionControls
                    itemId={item.id}
                    itemCollectionIds={new Set((item.collections ?? []).map((c) => c.id))}
                    onOpenManageCollections={() => setManageCollectionsItemId(item.id)}
                  />
                )}
              </>
            )}
          />
      )}

      {manageCollectionsItemId && (
        <ItemCollectionsModal
          isOpen={!!manageCollectionsItemId}
          onClose={() => setManageCollectionsItemId(null)}
          itemId={manageCollectionsItemId}
        />
      )}
    </div>
  );
};

export default CollectionDetailPage;
