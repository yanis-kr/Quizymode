import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/api/collections";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  TrashIcon,
  ListBulletIcon,
  EyeIcon,
  AcademicCapIcon,
  BookmarkIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkIconSolid } from "@heroicons/react/24/solid";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import type { CollectionDiscoverItem } from "@/types/api";

type TabId = "mine" | "bookmarked" | "discover";

interface CollectionCardProps {
  id: string;
  name: string;
  itemCount: number;
  createdAt: string;
  createdBy?: string;
  isOwner?: boolean;
  isBookmarked?: boolean;
  selectedCollectionId?: string | null;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  onBookmark?: (id: string) => void;
  onUnbookmark?: (id: string) => void;
  onDelete?: (id: string, name: string) => void;
  isBookmarkPending?: boolean;
  isDeletePending?: boolean;
}

function CollectionCard({
  id,
  name,
  itemCount,
  createdAt,
  createdBy,
  isOwner,
  isBookmarked,
  selectedCollectionId,
  cardRef,
  onBookmark,
  onUnbookmark,
  onDelete,
  isBookmarkPending,
  isDeletePending,
}: CollectionCardProps) {
  return (
    <div
      ref={cardRef}
      className={`bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow p-6 ${
        selectedCollectionId === id ? "ring-2 ring-indigo-500 ring-offset-2" : ""
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <Link to={`/collections/${id}`} className="flex-1">
          <h3 className="text-lg font-medium text-gray-900">{name}</h3>
          <p className="mt-2 text-sm text-gray-500">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </p>
          {createdBy && (
            <p className="mt-1 text-xs text-gray-400">By {createdBy}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            Created {new Date(createdAt).toLocaleDateString()}
          </p>
        </Link>
        <div className="flex items-center gap-1 ml-2">
          {isOwner && onDelete && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(id, name);
              }}
              disabled={isDeletePending}
              className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50"
              title="Delete collection"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          )}
          {!isOwner && isBookmarked && onUnbookmark && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUnbookmark(id);
              }}
              disabled={isBookmarkPending}
              className="p-2 text-amber-600 hover:bg-amber-50 rounded-md disabled:opacity-50"
              title="Remove bookmark"
            >
              <BookmarkIconSolid className="h-5 w-5" />
            </button>
          )}
          {!isOwner && !isBookmarked && onBookmark && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBookmark(id);
              }}
              disabled={isBookmarkPending}
              className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md disabled:opacity-50"
              title="Bookmark collection"
            >
              <BookmarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <Link
          to={`/collections/${id}`}
          className="flex items-center px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
          onClick={(e) => e.stopPropagation()}
        >
          <ListBulletIcon className="h-4 w-4 mr-1" />
          List
        </Link>
        <Link
          to={`/explore/collections/${id}`}
          className="flex items-center px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
          onClick={(e) => e.stopPropagation()}
        >
          <EyeIcon className="h-4 w-4 mr-1" />
          Explore
        </Link>
        <Link
          to={`/quiz/collections/${id}`}
          className="flex items-center px-3 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-md hover:bg-green-100"
          onClick={(e) => e.stopPropagation()}
        >
          <AcademicCapIcon className="h-4 w-4 mr-1" />
          Quiz
        </Link>
      </div>
    </div>
  );
}

const CollectionsPage = () => {
  const { isAuthenticated, isLoading: authLoading, userId } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [createCollectionDescription, setCreateCollectionDescription] = useState("");
  const [createCollectionIsPublic, setCreateCollectionIsPublic] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCollectionId = searchParams.get("selected");
  const tabParam = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam && ["mine", "bookmarked", "discover"].includes(tabParam) ? tabParam : "mine");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverPage, setDiscoverPage] = useState(1);
  const [collectionIdInput, setCollectionIdInput] = useState("");
  const selectedCollectionRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (tabParam && ["mine", "bookmarked", "discover"].includes(tabParam)) {
      setActiveTab(tabParam as TabId);
    }
  }, [tabParam]);

  const setTab = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.getAll(),
    enabled: isAuthenticated && !authLoading,
    retry: false,
  });

  const { data: bookmarksData } = useQuery({
    queryKey: ["collections", "bookmarks"],
    queryFn: () => collectionsApi.getBookmarks(),
    enabled: isAuthenticated && !authLoading && activeTab === "bookmarked",
  });

  const { data: discoverData, isLoading: discoverLoading } = useQuery({
    queryKey: ["collections", "discover", discoverQuery, discoverPage],
    queryFn: () => collectionsApi.discover(discoverQuery || undefined, discoverPage, 12),
    enabled: activeTab === "discover",
  });

  useEffect(() => {
    if (selectedCollectionId && (data?.collections?.length || bookmarksData?.collections?.length) && selectedCollectionRef.current) {
      setTimeout(() => {
        selectedCollectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [selectedCollectionId, data?.collections, bookmarksData?.collections]);

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; isPublic?: boolean }) =>
      collectionsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setShowCreateModal(false);
      setCollectionName("");
      setCreateCollectionDescription("");
      setCreateCollectionIsPublic(false);
    },
    onError: (err: unknown) => console.error("Failed to create collection:", err),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => collectionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: (err: unknown) => console.error("Failed to delete collection:", err),
  });

  const bookmarkMutation = useMutation({
    mutationFn: (id: string) => collectionsApi.bookmark(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["collections", "bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["collections", "discover"] });
    },
    onError: (err: unknown) => console.error("Failed to bookmark:", err),
  });

  const unbookmarkMutation = useMutation({
    mutationFn: (id: string) => collectionsApi.unbookmark(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["collections", "bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["collections", "discover"] });
    },
    onError: (err: unknown) => console.error("Failed to remove bookmark:", err),
  });

  const handleDeleteCollection = (collectionId: string, collectionName: string) => {
    if (window.confirm(`Are you sure you want to delete "${collectionName}"? This action cannot be undone.`)) {
      deleteMutation.mutate(collectionId);
    }
  };

  const handleOpenCollectionById = () => {
    const id = collectionIdInput.trim();
    if (!id) return;
    const guidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (guidRegex.test(id)) {
      navigate(`/collections/${id}`);
    } else {
      window.alert("Please enter a valid collection ID (GUID format).");
    }
  };

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (collectionName.trim()) {
      createMutation.mutate({
        name: collectionName.trim(),
        description: createCollectionDescription.trim() || undefined,
        isPublic: createCollectionIsPublic,
      });
    }
  };

  const myCollections = data?.collections ?? [];
  const bookmarkedCollections = bookmarksData?.collections ?? [];
  const discoverItems = discoverData?.items ?? [];
  const discoverTotal = discoverData?.totalCount ?? 0;

  if (authLoading) return <LoadingSpinner />;
  if (!authLoading && !isAuthenticated) return <Navigate to="/login" replace />;

  const showMineContent = activeTab === "mine" && (isLoading || error || myCollections.length > 0 || !isLoading);
  if (activeTab === "mine" && isLoading) return <LoadingSpinner />;
  if (activeTab === "mine" && error) {
    return (
      <ErrorMessage
        message="Failed to load collections"
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Collections</h1>
        <p className="text-gray-600 text-sm">
          Your collections, bookmarks, and discover public collections. You can also open a collection by ID.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          {(["mine", "bookmarked", "discover"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize ${
                activeTab === tab
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {tab === "mine" ? "Mine" : tab === "bookmarked" ? "Bookmarked" : "Discover"}
            </button>
          ))}
        </div>
        {activeTab === "mine" && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Create Collection
          </button>
        )}
      </div>

      {activeTab === "discover" && (
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="search"
                placeholder="Search public collections..."
                value={discoverQuery}
                onChange={(e) => {
                  setDiscoverQuery(e.target.value);
                  setDiscoverPage(1);
                }}
                onKeyDown={(e) => e.key === "Enter" && setDiscoverPage(1)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setDiscoverPage(1)}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
            >
              Search
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Collection ID (e.g. from link)"
              value={collectionIdInput}
              onChange={(e) => setCollectionIdInput(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && handleOpenCollectionById()}
              className="min-w-[240px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
            />
            <button
              type="button"
              onClick={handleOpenCollectionById}
              className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm whitespace-nowrap"
            >
              Open by ID
            </button>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
          onClick={() => {
            if (!createMutation.isPending) {
              setShowCreateModal(false);
              setCollectionName("");
              setCreateCollectionDescription("");
              setCreateCollectionIsPublic(false);
            }
          }}
        >
          <div
            className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Collection</h3>
              <form onSubmit={handleCreateCollection}>
                <div className="mb-4">
                  <label htmlFor="collection-name" className="block text-sm font-medium text-gray-700 mb-2">
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
                <div className="mb-4">
                  <label htmlFor="collection-description" className="block text-sm font-medium text-gray-700 mb-2">
                    Description (optional, helps find it in search)
                  </label>
                  <textarea
                    id="collection-description"
                    value={createCollectionDescription}
                    onChange={(e) => setCreateCollectionDescription(e.target.value)}
                    placeholder="e.g. Biology chapter 5 practice set"
                    rows={2}
                    maxLength={2000}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="mb-4 flex items-center">
                  <input
                    id="collection-is-public"
                    type="checkbox"
                    checked={createCollectionIsPublic}
                    onChange={(e) => setCreateCollectionIsPublic(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="collection-is-public" className="ml-2 block text-sm text-gray-700">
                    Shared with others (anyone with the link can view and quiz; also appears in Discover)
                  </label>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => { setShowCreateModal(false); setCollectionName(""); setCreateCollectionDescription(""); setCreateCollectionIsPublic(false); }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    disabled={createMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || !collectionName.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createMutation.isPending ? "Creating..." : "Create"}
                  </button>
                </div>
              </form>
              {createMutation.isError && (
                <div className="mt-3 text-sm text-red-600">Failed to create collection. Please try again.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "mine" && (
        myCollections.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myCollections.map((c) => (
              <CollectionCard
                key={c.id}
                id={c.id}
                name={c.name}
                itemCount={c.itemCount}
                createdAt={c.createdAt}
                isOwner={true}
                selectedCollectionId={selectedCollectionId}
                cardRef={selectedCollectionId === c.id ? selectedCollectionRef : undefined}
                onDelete={handleDeleteCollection}
                isDeletePending={deleteMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No collections yet. Create your first collection!</p>
          </div>
        )
      )}

      {activeTab === "bookmarked" && (
        bookmarkedCollections.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bookmarkedCollections.map((c) => (
              <CollectionCard
                key={c.id}
                id={c.id}
                name={c.name}
                itemCount={c.itemCount}
                createdAt={c.createdAt}
                createdBy={c.createdBy}
                isOwner={userId ? c.createdBy === userId : false}
                isBookmarked={true}
                selectedCollectionId={selectedCollectionId}
                cardRef={selectedCollectionId === c.id ? selectedCollectionRef : undefined}
                onUnbookmark={(id) => unbookmarkMutation.mutate(id)}
                isBookmarkPending={unbookmarkMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No bookmarked collections. Use Discover to find and bookmark public collections.</p>
          </div>
        )
      )}

      {activeTab === "discover" && (
        <>
          {discoverLoading ? (
            <LoadingSpinner />
          ) : discoverItems.length > 0 ? (
            <>
              <p className="text-sm text-gray-500 mb-4">
                {discoverTotal} public collection{discoverTotal !== 1 ? "s" : ""} found. Make your collection public in its settings to appear here.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {discoverItems.map((c: CollectionDiscoverItem) => (
                  <CollectionCard
                    key={c.id}
                    id={c.id}
                    name={c.name}
                    itemCount={c.itemCount}
                    createdAt={c.createdAt}
                    createdBy={c.createdBy}
                    isOwner={false}
                    isBookmarked={c.isBookmarked}
                    selectedCollectionId={selectedCollectionId}
                    cardRef={selectedCollectionId === c.id ? selectedCollectionRef : undefined}
                    onBookmark={!c.isBookmarked ? (id) => bookmarkMutation.mutate(id) : undefined}
                    onUnbookmark={c.isBookmarked ? (id) => unbookmarkMutation.mutate(id) : undefined}
                    isBookmarkPending={bookmarkMutation.isPending || unbookmarkMutation.isPending}
                  />
                ))}
              </div>
              {discoverTotal > discoverItems.length && (
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    disabled={discoverPage <= 1}
                    onClick={() => setDiscoverPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="py-2 text-sm text-gray-600">
                    Page {discoverPage} of {Math.ceil(discoverTotal / 12)}
                  </span>
                  <button
                    type="button"
                    disabled={discoverPage >= Math.ceil(discoverTotal / 12)}
                    onClick={() => setDiscoverPage((p) => p + 1)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">
                {discoverQuery ? "No public collections match your search." : "No public collections yet. Create a collection and make it public to share it."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CollectionsPage;
