import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { ratingsApi } from "@/api/ratings";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { ItemResponse, KeywordResponse, ItemCollectionResponse } from "@/types/api";
import ItemRatingsComments from "./ItemRatingsComments";

interface ItemListCardProps {
  item: ItemResponse;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onKeywordClick?: (keywordName: string, item?: ItemResponse) => void;
  selectedKeywords?: string[];
  actions?: React.ReactNode;
  /** When true, shows full ratings (set stars) and comments link */
  showRatingsAndComments?: boolean;
  returnUrl?: string;
}

const ItemListCard = ({
  item,
  isSelected,
  onToggleSelect,
  onKeywordClick,
  selectedKeywords,
  actions,
  showRatingsAndComments,
  returnUrl,
}: ItemListCardProps) => {
  const hasSelection = typeof onToggleSelect === "function";

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-start">
        <div className="flex items-start space-x-3 flex-1">
          {hasSelection && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
          )}
          <div className="flex-1">
            <h3 className="text-lg font-medium text-gray-900">
              {item.question}
            </h3>
            <p className="mt-2 text-sm text-gray-500">{item.category}</p>
            <p className="mt-1 text-sm text-gray-500">
              {item.isPrivate ? "Private" : "Public"}
            </p>
            <ItemAverageStars itemId={item.id} />
            <p className="mt-2 text-sm text-gray-700">
              <strong>Answer:</strong> {item.correctAnswer}
            </p>

            <KeywordsAndCollectionsSection
              keywords={item.keywords}
              collections={item.collections}
              onKeywordClick={onKeywordClick ? (kw) => onKeywordClick(kw, item) : undefined}
              selectedKeywords={selectedKeywords}
            />
            {showRatingsAndComments && (
              <ItemRatingsComments
                itemId={item.id}
                returnUrl={returnUrl}
              />
            )}
          </div>
        </div>
        {actions && <div className="flex space-x-1 ml-4">{actions}</div>}
      </div>
    </div>
  );
};

const ItemAverageStars = ({ itemId }: { itemId: string }) => {
  const { data: ratingStats } = useQuery({
    queryKey: ["ratingStats", itemId],
    queryFn: () => ratingsApi.getStats(itemId),
    enabled: true,
  });

  const averageStars = ratingStats?.averageStars;
  const ratingCount = ratingStats?.count ?? 0;

  if (averageStars === null || averageStars === undefined) {
    return null;
  }

  return (
    <div className="mt-1 flex items-center space-x-1 text-sm text-gray-600">
      <StarIconSolid className="h-4 w-4 text-yellow-400" />
      <span className="font-medium">{averageStars.toFixed(1)}</span>
      <span className="text-gray-500">({ratingCount})</span>
    </div>
  );
};

const KeywordsAndCollectionsSection = ({
  keywords,
  collections,
  onKeywordClick,
  selectedKeywords,
}: {
  keywords?: KeywordResponse[];
  collections?: ItemCollectionResponse[];
  onKeywordClick?: (keywordName: string) => void;
  selectedKeywords?: string[];
}) => {
  const hasKeywords = keywords && keywords.length > 0;
  const hasCollections = collections && collections.length > 0;

  if (!hasKeywords && !hasCollections) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 items-center">
      {hasKeywords && (
        <>
          {keywords.map((keyword) => (
            <KeywordChip
              key={keyword.id}
              keyword={keyword}
              onClick={onKeywordClick}
              isSelected={selectedKeywords?.includes(keyword.name) ?? false}
            />
          ))}
        </>
      )}
      {hasCollections && (
        <>
          {collections!.map((collection: ItemCollectionResponse) => (
            <CollectionChip key={collection.id} collection={collection} />
          ))}
        </>
      )}
    </div>
  );
};


const CollectionChip = ({
  collection,
}: {
  collection: ItemCollectionResponse;
}) => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/collections?selected=${collection.id}`)}
      className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
      title={`Collection: ${collection.name} (click to view)`}
    >
      {collection.name}
    </button>
  );
};

const KeywordChip = ({
  keyword,
  onClick,
  isSelected,
}: {
  keyword: KeywordResponse;
  onClick?: (keywordName: string) => void;
  isSelected: boolean;
}) => {
  const baseClass =
    "inline-flex items-center px-2 py-1 rounded text-xs font-medium transition-colors";

  if (onClick) {
    return (
      <button
        onClick={() => onClick(keyword.name)}
        className={`${baseClass} ${
          isSelected
            ? "bg-indigo-600 text-white"
            : keyword.isPrivate
            ? "bg-purple-100 text-purple-800 hover:bg-purple-200"
            : "bg-blue-100 text-blue-800 hover:bg-blue-200"
        }`}
        title={
          keyword.isPrivate
            ? "Private keyword (click to filter)"
            : "Public keyword (click to filter)"
        }
      >
        {keyword.name}
        {keyword.isPrivate && <span className="ml-1 text-[10px]">🔒</span>}
      </button>
    );
  }

  return (
    <span
      className={`${baseClass} ${
        keyword.isPrivate
          ? "bg-purple-100 text-purple-800"
          : "bg-blue-100 text-blue-800"
      }`}
      title={keyword.isPrivate ? "Private keyword" : "Public keyword"}
    >
      {keyword.name}
      {keyword.isPrivate && <span className="ml-1 text-[10px]">🔒</span>}
    </span>
  );
};

export default ItemListCard;
