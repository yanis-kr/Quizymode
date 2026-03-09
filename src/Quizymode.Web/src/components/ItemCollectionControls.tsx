import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderIcon, PlusIcon, MinusIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCollection } from "@/hooks/useActiveCollection";
import { collectionsApi } from "@/api/collections";

interface ItemCollectionControlsProps {
  itemId: string;
  /** Item's current collection ids (from item.collections) */
  itemCollectionIds: Set<string>;
  onOpenManageCollections: () => void;
  /** Called after add/remove so parent can refetch item if needed */
  onSuccess?: () => void;
}

/**
 * Block of controls: Manage collections icon, optional 3-char active collection name,
 * plus (add to active), minus (remove from active).
 */
export const ItemCollectionControls = ({
  itemId,
  itemCollectionIds,
  onOpenManageCollections,
  onSuccess,
}: ItemCollectionControlsProps) => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { activeCollectionId, activeCollection } = useActiveCollection();

  const isInActiveCollection =
    !!activeCollectionId && itemCollectionIds.has(activeCollectionId);
  const canAddToActive =
    !!activeCollectionId && !itemCollectionIds.has(activeCollectionId);
  const canRemoveFromActive = isInActiveCollection;

  const addMutation = useMutation({
    mutationFn: () =>
      collectionsApi.addItem(activeCollectionId!, { itemId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["myItems"] });
      queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
      onSuccess?.();
    },
  });

  const removeMutation = useMutation({
    mutationFn: () =>
      collectionsApi.removeItem(activeCollectionId!, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["myItems"] });
      queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
      onSuccess?.();
    },
  });

  if (!isAuthenticated) return null;

  const activeNameShort = activeCollection?.name
    ? activeCollection.name.slice(0, 3)
    : "";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onOpenManageCollections}
        className="p-2 text-blue-600 hover:bg-blue-50 rounded-md"
        title="Manage collections"
      >
        <FolderIcon className="h-5 w-5" />
      </button>
      {activeNameShort && (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 min-w-[2.5rem] justify-center"
          title={activeCollection?.name}
        >
          {activeNameShort}
        </span>
      )}
      <button
        onClick={() => addMutation.mutate()}
        disabled={!canAddToActive || addMutation.isPending}
        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
        title={
          canAddToActive
            ? `Add to ${activeCollection?.name ?? "active collection"}`
            : "Add to active collection (select an active collection or item already in it)"
        }
      >
        <PlusIcon className="h-5 w-5" />
      </button>
      <button
        onClick={() => removeMutation.mutate()}
        disabled={!canRemoveFromActive || removeMutation.isPending}
        className="p-2 text-amber-600 hover:bg-amber-50 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
        title={
          canRemoveFromActive
            ? `Remove from ${activeCollection?.name ?? "active collection"}`
            : "Remove from active collection (item not in active collection)"
        }
      >
        <MinusIcon className="h-5 w-5" />
      </button>
    </div>
  );
};
