import { useQuery } from "@tanstack/react-query";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { collectionsApi } from "@/api/collections";
import { ratingsApi } from "@/api/ratings";
import { useAuth } from "@/contexts/AuthContext";
import type { ItemResponse, KeywordResponse, CollectionResponse } from "@/types/api";

interface ItemListCardProps {
  item: ItemResponse;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onKeywordClick?: (keywordName: string) => void;
  selectedKeywords?: string[];
  actions?: React.ReactNode;
}

const ItemListCard = ({
  item,
  isSelected,
  onToggleSelect,
  onKeywordClick,
  selectedKeywords,
  actions,
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
              {item.isPrivate ? "Private" : "Global"}
            </p>
            <ItemAverageStars itemId={item.id} />
            <p className="mt-2 text-sm text-gray-700">
              <strong>Answer:</strong> {item.correctAnswer}
            </p>

            <KeywordsAndCollectionsSection
              keywords={item.keywords}
              itemId={item.id}
              onKeywordClick={onKeywordClick}
              selectedKeywords={selectedKeywords}
            />
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
  itemId,
  onKeywordClick,
  selectedKeywords,
}: {
  keywords?: KeywordResponse[];
  itemId: string;
  onKeywordClick?: (keywordName: string) => void;
  selectedKeywords?: string[];
}) => {
  const { isAuthenticated } = useAuth();
  
  const { data: collectionsData, isLoading, error } = useQuery({
    queryKey: ["itemCollections", itemId],
    queryFn: async () => {
      try {
        return await collectionsApi.getCollectionsForItem(itemId);
      } catch (err: any) {
        // Handle 404 as "no collections" rather than an error
        if (err?.response?.status === 404) {
          return { collections: [] };
        }
        // Re-throw other errors
        throw err;
      }
    },
    enabled: isAuthenticated && !!itemId,
    refetchOnMount: "always",
    retry: false,
  });

  // Handle the response - check both camelCase and PascalCase just in case
  const collections = collectionsData?.collections || (collectionsData as any)?.Collections || [];
  const hasKeywords = keywords && keywords.length > 0;
  const hasCollections = collections.length > 0;

  // Only show error for non-404 errors (server errors, network issues, etc.)
  const showError = error && (error as any)?.response?.status !== 404;

  // Always show the container if there are keywords, even if collections are loading
  if (!hasKeywords && !hasCollections && !isLoading && !showError) {
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
          {collections.map((collection: CollectionResponse) => (
            <span
              key={collection.id}
              className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-800"
              title={`Collection: ${collection.name}`}
            >
              {collection.name}
            </span>
          ))}
        </>
      )}
      {showError && (
        <span className="text-xs text-red-500" title={`Failed to load collections: ${(error as any)?.message || "Unknown error"}`}>
          (Error loading collections)
        </span>
      )}
    </div>
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
            : "Global keyword (click to filter)"
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
      title={keyword.isPrivate ? "Private keyword" : "Global keyword"}
    >
      {keyword.name}
      {keyword.isPrivate && <span className="ml-1 text-[10px]">🔒</span>}
    </span>
  );
};

export default ItemListCard;
