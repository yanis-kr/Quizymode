/**
 * Compact control bar that replaces the inline FilterSection header.
 * Shows a filter trigger button (with active badge) and an optional sort dropdown.
 */
import { FunnelIcon } from "@heroicons/react/24/outline";

interface SortOptionItem {
  value: string;
  label: string;
}

interface FilterControlBarProps {
  hasActiveFilters: boolean;
  /** Number to display in the badge; hidden when 0 or undefined. */
  activeFilterCount?: number;
  onOpenFilters: () => void;
  sortBy?: string;
  onSortChange?: (sort: string) => void;
  sortOptions?: SortOptionItem[];
}

export function FilterControlBar({
  hasActiveFilters,
  activeFilterCount,
  onOpenFilters,
  sortBy,
  onSortChange,
  sortOptions,
}: FilterControlBarProps) {
  const showSort = sortBy != null && onSortChange != null && sortOptions != null && sortOptions.length > 0;

  return (
    <div className="flex items-center justify-between gap-2 py-2 mb-1">
      {/* Filter trigger */}
      <button
        type="button"
        onClick={onOpenFilters}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
          hasActiveFilters
            ? "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        <FunnelIcon className="h-4 w-4" />
        Filters
        {hasActiveFilters && activeFilterCount != null && activeFilterCount > 0 && (
          <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold leading-none text-white">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Sort dropdown */}
      {showSort && (
        <div className="flex items-center gap-1.5">
          <label htmlFor="filter-bar-sort" className="hidden text-sm text-gray-500 sm:block whitespace-nowrap">
            Sort:
          </label>
          <select
            id="filter-bar-sort"
            value={sortBy}
            onChange={(e) => onSortChange!(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-indigo-400 focus:outline-none focus:ring-0"
          >
            {sortOptions!.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
