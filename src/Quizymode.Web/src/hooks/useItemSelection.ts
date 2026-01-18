import { useEffect, useMemo, useState } from "react";

interface UseItemSelectionResult {
  selectedItemIds: Set<string>;
  selectedIds: string[];
  toggleItem: (itemId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
}

const useItemSelection = (
  itemIds: string[],
  resetKeys: readonly unknown[] = []
): UseItemSelectionResult => {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    setSelectedItemIds(new Set());
  }, resetKeys);

  const selectedIds = useMemo(
    () => Array.from(selectedItemIds),
    [selectedItemIds]
  );

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedItemIds(new Set(itemIds));
  };

  const deselectAll = () => {
    setSelectedItemIds(new Set());
  };

  return {
    selectedItemIds,
    selectedIds,
    toggleItem,
    selectAll,
    deselectAll,
  };
};

export default useItemSelection;
