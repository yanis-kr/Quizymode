import type { ReactNode } from "react";
import type { ItemResponse } from "@/types/api";
import ItemListControls from "@/components/ItemListControls";
import ItemListCard from "@/components/ItemListCard";

interface ItemListSectionProps {
  items: ItemResponse[];
  totalCount: number;
  page: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  renderActions?: (item: ItemResponse) => ReactNode;
  onKeywordClick?: (keywordName: string, item?: import("@/types/api").ItemResponse) => void;
  selectedKeywords?: string[];
  showRatingsAndComments?: boolean;
  returnUrl?: string;
}

const ItemListSection = ({
  items,
  totalCount: _totalCount,
  page,
  totalPages,
  onPrevPage,
  onNextPage,
  renderActions,
  onKeywordClick,
  selectedKeywords,
  showRatingsAndComments,
  returnUrl,
}: ItemListSectionProps) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <ItemListControls
        page={page}
        totalPages={totalPages}
        onPrevPage={onPrevPage}
        onNextPage={onNextPage}
        isPrevDisabled={page === 1}
        isNextDisabled={page === totalPages}
      />

      <div className="space-y-4 mb-6">
        {items.map((item) => (
          <ItemListCard
            key={item.id}
            item={item}
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
