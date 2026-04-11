import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderIcon, PlusIcon, MinusIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCollection } from "@/hooks/useActiveCollection";
import { collectionsApi } from "@/api/collections";

export interface CollectionUpdatePayload {
  added?: { id: string; name: string };
  removedId?: string;
}

export type ItemCollectionControlsDisplayMode = "default" | "compact-mobile";

interface ItemCollectionControlsProps {
  itemId: string;
  /** Item's current collection ids (from item.collections) */
  itemCollectionIds: Set<string>;
  onOpenManageCollections: () => void;
  /** Called after add/remove so parent can update UI (e.g. quiz cache). Receives new ids and what changed. */
  onSuccess?: (updatedCollectionIds: Set<string>, payload: CollectionUpdatePayload) => void;
  displayMode?: ItemCollectionControlsDisplayMode;
}

/**
 * Block of controls: Manage collections icon, optional 3-char active collection name,
 * plus (add to active), minus (remove from active).
 */
export function getCompactCollectionLabel(name: string | null | undefined): string {
  if (!name) {
    return "";
  }

  const firstWord = name.trim().split(/\s+/)[0] ?? "";
  const sanitized = firstWord.replace(/[^a-zA-Z0-9]/g, "");
  if (!sanitized) {
    return "";
  }

  const compact = sanitized.slice(0, 3);
  return compact.charAt(0).toUpperCase() + compact.slice(1).toLowerCase();
}

export const ItemCollectionControls = ({
  itemId,
  itemCollectionIds,
  onOpenManageCollections,
  onSuccess,
  displayMode = "default",
}: ItemCollectionControlsProps) => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { activeCollectionId, activeCollection } = useActiveCollection();
  const compactLabel = getCompactCollectionLabel(activeCollection?.name);
  const isCompactMobile = displayMode === "compact-mobile";

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
      queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["collectionItems"] });
      const nextIds = new Set([...itemCollectionIds, activeCollectionId!]);
      onSuccess?.(nextIds, {
        added: activeCollection
          ? { id: activeCollectionId!, name: activeCollection.name }
          : { id: activeCollectionId!, name: "" },
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () =>
      collectionsApi.removeItem(activeCollectionId!, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["categoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["collectionItems"] });
      const nextIds = new Set([...itemCollectionIds].filter((id) => id !== activeCollectionId));
      onSuccess?.(nextIds, { removedId: activeCollectionId! });
    },
  });

  if (!isAuthenticated) return null;

  return (
    <div className={`flex items-center flex-wrap ${isCompactMobile ? "gap-1 sm:gap-2" : "gap-2"}`}>
      <button
        onClick={onOpenManageCollections}
        className={`inline-flex items-center rounded-md text-blue-600 hover:bg-blue-50 ${
          isCompactMobile
            ? "gap-1 px-1.5 py-1 text-xs sm:gap-1.5 sm:px-2 sm:py-1.5 sm:text-sm"
            : "gap-1.5 px-2 py-1.5"
        }`}
        title="Manage collections"
      >
        <FolderIcon className={`${isCompactMobile ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5"} shrink-0`} />
        {activeCollection?.name && (
          <>
            {isCompactMobile ? (
              <>
                <span
                  className="text-[11px] font-semibold text-slate-700 sm:hidden"
                  title={activeCollection.name}
                >
                  {compactLabel}
                </span>
                <span
                  className="hidden max-w-[10rem] truncate text-sm font-medium text-slate-700 sm:inline"
                  title={activeCollection.name}
                >
                  {activeCollection.name}
                </span>
              </>
            ) : (
              <span className="text-sm font-medium text-slate-700 max-w-[10rem] truncate" title={activeCollection.name}>
                {activeCollection.name}
              </span>
            )}
          </>
        )}
      </button>
      <button
        onClick={() => addMutation.mutate()}
        disabled={!canAddToActive || addMutation.isPending}
        className={`text-emerald-600 hover:bg-emerald-50 rounded-md disabled:opacity-40 disabled:cursor-not-allowed ${
          isCompactMobile ? "p-1.5 sm:p-2" : "p-2"
        }`}
        title={
          canAddToActive
            ? `Add to ${activeCollection?.name ?? "active collection"}`
            : "Add to active collection (select an active collection or item already in it)"
        }
      >
        <PlusIcon className={isCompactMobile ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5"} />
      </button>
      <button
        onClick={() => removeMutation.mutate()}
        disabled={!canRemoveFromActive || removeMutation.isPending}
        className={`text-amber-600 hover:bg-amber-50 rounded-md disabled:opacity-40 disabled:cursor-not-allowed ${
          isCompactMobile ? "p-1.5 sm:p-2" : "p-2"
        }`}
        title={
          canRemoveFromActive
            ? `Remove from ${activeCollection?.name ?? "active collection"}`
            : "Remove from active collection (item not in active collection)"
        }
      >
        <MinusIcon className={isCompactMobile ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5"} />
      </button>
    </div>
  );
};
