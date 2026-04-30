import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { featuredApi } from "@/api/featured";
import type { AdminFeaturedItemDto } from "@/api/featured";
import { categoriesApi } from "@/api/categories";
import { keywordsApi } from "@/api/keywords";
import { collectionsApi } from "@/api/collections";
import { TrashIcon, PencilSquareIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";

type AddMode = "none" | "set" | "collection";

const AdminFeaturedPage = () => {
  const queryClient = useQueryClient();

  const [addMode, setAddMode] = useState<AddMode>("none");

  // Set form state
  const [setCategory, setSetCategory] = useState("");
  const [setKw1, setSetKw1] = useState("");
  const [setKw2, setSetKw2] = useState("");
  const [setDisplayName, setSetDisplayName] = useState("");
  const [setSortOrder, setSetSortOrder] = useState(0);

  // Collection form state
  const [colSearch, setColSearch] = useState("");
  const [colSelectedId, setColSelectedId] = useState("");
  const [colSelectedName, setColSelectedName] = useState("");
  const [colDisplayName, setColDisplayName] = useState("");
  const [colSortOrder, setColSortOrder] = useState(0);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["adminFeatured"],
    queryFn: () => featuredApi.adminList(),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.getAll(),
    enabled: addMode === "set",
  });

  const { data: kw1Data } = useQuery({
    queryKey: ["keywords", "rank1", setCategory],
    queryFn: () => keywordsApi.getNavigationKeywords(setCategory, []),
    enabled: addMode === "set" && !!setCategory,
  });

  const { data: kw2Data } = useQuery({
    queryKey: ["keywords", "rank2", setCategory, setKw1],
    queryFn: () => keywordsApi.getNavigationKeywords(setCategory, [setKw1]),
    enabled: addMode === "set" && !!setCategory && !!setKw1,
  });

  const { data: discoverData } = useQuery({
    queryKey: ["collections", "discover", colSearch],
    queryFn: () => collectionsApi.discover({ q: colSearch || undefined, pageSize: 20 }),
    enabled: addMode === "collection",
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!setCategory) { setSetKw1(""); setSetKw2(""); }
  }, [setCategory]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!setKw1) setSetKw2("");
  }, [setKw1]);

  const addMutation = useMutation({
    mutationFn: featuredApi.adminAdd,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminFeatured"] });
      queryClient.invalidateQueries({ queryKey: ["featured"] });
      resetForms();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { displayName?: string; sortOrder?: number } }) =>
      featuredApi.adminUpdate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminFeatured"] });
      queryClient.invalidateQueries({ queryKey: ["featured"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: featuredApi.adminDelete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminFeatured"] });
      queryClient.invalidateQueries({ queryKey: ["featured"] });
    },
  });

  const resetForms = () => {
    setAddMode("none");
    setSetCategory(""); setSetKw1(""); setSetKw2(""); setSetDisplayName(""); setSetSortOrder(0);
    setColSearch(""); setColSelectedId(""); setColSelectedName(""); setColDisplayName(""); setColSortOrder(0);
  };

  const handleAddSet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!setCategory || !setKw1 || !setDisplayName.trim()) return;
    addMutation.mutate({
      type: "Set",
      displayName: setDisplayName.trim(),
      categorySlug: setCategory.toLowerCase(),
      navKeyword1: setKw1.toLowerCase(),
      navKeyword2: setKw2 ? setKw2.toLowerCase() : undefined,
      sortOrder: setSortOrder,
    });
  };

  const handleAddCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!colSelectedId || !colDisplayName.trim()) return;
    addMutation.mutate({
      type: "Collection",
      displayName: colDisplayName.trim(),
      collectionId: colSelectedId,
      sortOrder: colSortOrder,
    });
  };

  const handleStartEdit = (item: AdminFeaturedItemDto) => {
    setEditingId(item.id);
    setEditDisplayName(item.displayName);
    setEditSortOrder(item.sortOrder);
  };

  const handleSaveEdit = (id: string) => {
    updateMutation.mutate({ id, data: { displayName: editDisplayName.trim(), sortOrder: editSortOrder } });
  };

  const handleDelete = (item: AdminFeaturedItemDto) => {
    if (window.confirm(`Remove "${item.displayName}" from Featured?`)) {
      deleteMutation.mutate(item.id);
    }
  };

  const kw1Options = (kw1Data?.keywords ?? []).filter(k => k.name.toLowerCase() !== "other");
  const kw2Options = (kw2Data?.keywords ?? []).filter(k => k.name.toLowerCase() !== "other");
  const sortedCategories = [...(categoriesData?.categories ?? [])].sort((a, b) => a.category.localeCompare(b.category));
  const discoverItems = discoverData?.items ?? [];

  if (isLoading) return <div className="p-6 text-gray-600">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Failed to load featured items.</div>;

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Featured</h1>
        <p className="mt-1 text-sm text-gray-500">
          Curate the sets and collections shown on the public Featured page.
        </p>
      </div>

      {/* Current list */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {items.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-500 text-sm">
            No featured items yet. Add a set or collection below.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Path / Collection</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Order</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.type === "Set"
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === item.id ? (
                      <input
                        type="text"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-900">{item.displayName}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {item.type === "Set"
                      ? [item.categorySlug, item.navKeyword1, item.navKeyword2].filter(Boolean).join(" › ")
                      : (item.collectionName ?? item.collectionId ?? "—")}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === item.id ? (
                      <input
                        type="number"
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(Number(e.target.value))}
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <span className="text-sm text-gray-600">{item.sortOrder}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {editingId === item.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(item.id)}
                          disabled={updateMutation.isPending}
                          className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50"
                          title="Save"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100"
                          title="Cancel"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-indigo-600"
                          title="Edit"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={deleteMutation.isPending}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          title="Remove"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add buttons */}
      {addMode === "none" && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setAddMode("set")}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Add Set
          </button>
          <button
            type="button"
            onClick={() => setAddMode("collection")}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            + Add Collection
          </button>
        </div>
      )}

      {/* Add Set form */}
      {addMode === "set" && (
        <form onSubmit={handleAddSet} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Add Featured Set</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
              <select
                value={setCategory}
                onChange={(e) => setSetCategory(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select category</option>
                {sortedCategories.map((c) => (
                  <option key={c.id} value={c.category.toLowerCase()}>{c.category}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">L1 Keyword</label>
              <select
                value={setKw1}
                onChange={(e) => setSetKw1(e.target.value)}
                disabled={!setCategory}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="">Select topic</option>
                {kw1Options.map((k) => (
                  <option key={k.name} value={k.name.toLowerCase()}>{k.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">L2 Keyword (optional)</label>
              <select
                value={setKw2}
                onChange={(e) => setSetKw2(e.target.value)}
                disabled={!setKw1}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="">Any subtopic</option>
                {kw2Options.map((k) => (
                  <option key={k.name} value={k.name.toLowerCase()}>{k.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Display Name</label>
              <input
                type="text"
                value={setDisplayName}
                onChange={(e) => setSetDisplayName(e.target.value)}
                placeholder="e.g. AWS SAA-C03"
                required
                maxLength={200}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Sort Order</label>
              <input
                type="number"
                value={setSortOrder}
                onChange={(e) => setSetSortOrder(Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={addMutation.isPending || !setCategory || !setKw1 || !setDisplayName.trim()}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {addMutation.isPending ? "Adding..." : "Add Set"}
            </button>
            <button type="button" onClick={resetForms} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
          {addMutation.isError && <p className="text-sm text-red-600">Failed to add. Please try again.</p>}
        </form>
      )}

      {/* Add Collection form */}
      {addMode === "collection" && (
        <form onSubmit={handleAddCollection} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Add Featured Collection</h2>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Search public collections</label>
            <input
              type="search"
              value={colSearch}
              onChange={(e) => { setColSearch(e.target.value); setColSelectedId(""); setColSelectedName(""); setColDisplayName(""); }}
              placeholder="Search by name..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {discoverItems.length > 0 && !colSelectedId && (
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white shadow-sm max-h-60 overflow-y-auto">
              {discoverItems.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setColSelectedId(c.id);
                      setColSelectedName(c.name);
                      setColDisplayName(c.name);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-indigo-50 focus:outline-none"
                  >
                    <span className="font-medium text-gray-900">{c.name}</span>
                    <span className="ml-2 text-gray-400">{c.itemCount} items</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {colSelectedId && (
            <div className="flex items-center gap-2 rounded-md bg-indigo-50 px-3 py-2 text-sm">
              <span className="font-medium text-indigo-900">{colSelectedName}</span>
              <button type="button" onClick={() => { setColSelectedId(""); setColSelectedName(""); setColDisplayName(""); }} className="ml-auto text-indigo-400 hover:text-indigo-600">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Display Name</label>
              <input
                type="text"
                value={colDisplayName}
                onChange={(e) => setColDisplayName(e.target.value)}
                placeholder="Leave as collection name or override"
                required
                maxLength={200}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Sort Order</label>
              <input
                type="number"
                value={colSortOrder}
                onChange={(e) => setColSortOrder(Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={addMutation.isPending || !colSelectedId || !colDisplayName.trim()}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {addMutation.isPending ? "Adding..." : "Add Collection"}
            </button>
            <button type="button" onClick={resetForms} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
          {addMutation.isError && <p className="text-sm text-red-600">Failed to add. Please try again.</p>}
        </form>
      )}
    </div>
  );
};

export default AdminFeaturedPage;
