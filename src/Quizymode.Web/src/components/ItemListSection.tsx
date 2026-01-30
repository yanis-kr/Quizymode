import type { ReactNode } from "react";
import type { ItemResponse } from "@/types/api";
import ItemListControls from "@/components/ItemListControls";
import ItemListCard from "@/components/ItemListCard";

interface ItemListSectionProps {
  items: ItemResponse[];
  totalCount: number;
  page: number;
  totalPages: number;
  selectedItemIds: Set<string>;
  onPrevPage: () => void;
  onNextPage: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onAddSelectedToCollection: () => void;
  onToggleSelect: (itemId: string) => void;
  renderActions?: (item: ItemResponse) => ReactNode;
  onKeywordClick?: (keywordName: string, item?: import("@/types/api").ItemResponse) => void;
  selectedKeywords?: string[];
  isAuthenticated?: boolean;
  showRatingsAndComments?: boolean;
  returnUrl?: string;
}

const ItemListSection = ({
  items,
  totalCount,
  page,
  totalPages,
  selectedItemIds,
  onPrevPage,
  onNextPage,
  onSelectAll,
  onDeselectAll,
  onAddSelectedToCollection,
  onToggleSelect,
  renderActions,
  onKeywordClick,
  selectedKeywords,
  isAuthenticated = true,
  showRatingsAndComments,
  returnUrl,
}: ItemListSectionProps) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <ItemListControls
        selectedCount={selectedItemIds.size}
        onScreenCount={items.length}
        totalCount={totalCount}
        page={page}
        totalPages={totalPages}
        onPrevPage={onPrevPage}
        onNextPage={onNextPage}
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
        onAddSelectedToCollection={onAddSelectedToCollection}
        isPrevDisabled={page === 1}
        isNextDisabled={page === totalPages}
        isSelectAllDisabled={items.length === 0}
        isDeselectAllDisabled={selectedItemIds.size === 0}
        isAddToCollectionDisabled={selectedItemIds.size === 0}
        isAuthenticated={isAuthenticated}
      />

      <div className="space-y-4 mb-6">
        {items.map((item) => (
          <ItemListCard
            key={item.id}
            item={item}
            isSelected={selectedItemIds.has(item.id)}
            onToggleSelect={() => onToggleSelect(item.id)}
            onKeywordClick={onKeywordClick ? (kw) => onKeywordClick(kw, item) : undefined}
            selectedKeywords={selectedKeywords}
            actions={renderActions ? renderActions(item) : undefined}
            showRatingsAndComments={showRatingsAndComments}
            returnUrl={returnUrl}
          />
        ))}
      </div>
    </>
  );
};

export default ItemListSection;
