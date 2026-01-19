interface ItemListControlsProps {
  selectedCount: number;
  onScreenCount: number;
  totalCount: number;
  page: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onAddSelectedToCollection: () => void;
  isPrevDisabled: boolean;
  isNextDisabled: boolean;
  isSelectAllDisabled: boolean;
  isDeselectAllDisabled: boolean;
  isAddToCollectionDisabled: boolean;
  isAuthenticated?: boolean;
}

const ItemListControls = ({
  selectedCount,
  onScreenCount,
  totalCount,
  page,
  totalPages,
  onPrevPage,
  onNextPage,
  onSelectAll,
  onDeselectAll,
  onAddSelectedToCollection,
  isPrevDisabled,
  isNextDisabled,
  isSelectAllDisabled,
  isDeselectAllDisabled,
  isAddToCollectionDisabled,
  isAuthenticated = true,
}: ItemListControlsProps) => {
  return (
    <div className="mb-4 bg-white rounded-lg shadow p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4 text-sm text-gray-700">
          <span>
            <strong>{selectedCount}</strong> selected
          </span>
          <span>
            <strong>{onScreenCount}</strong> on screen
          </span>
          <span>
            <strong>{totalCount}</strong> total
          </span>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center space-x-2">
            <button
              onClick={onPrevPage}
              disabled={isPrevDisabled}
              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous page"
            >
              ‹
            </button>
            <span className="text-sm text-gray-700">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={onNextPage}
              disabled={isNextDisabled}
              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next page"
            >
              ›
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onSelectAll}
            className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
            disabled={isSelectAllDisabled}
          >
            Select All
          </button>
          <button
            onClick={onDeselectAll}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
            disabled={isDeselectAllDisabled}
          >
            Deselect All
          </button>
          <button
            onClick={onAddSelectedToCollection}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isAddToCollectionDisabled || !isAuthenticated}
            title={!isAuthenticated ? "You must be logged in to add items to collections" : undefined}
          >
            Add Selected to Collection
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItemListControls;
