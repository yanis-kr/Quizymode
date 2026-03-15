/**
 * Shared filter panel for List mode. Use in category list and collection list.
 * Config controls which filters are shown; parent owns state.
 */
export interface FiltersPanelConfig {
  showCategory?: boolean;
  showKeywords?: boolean;
  showSearch?: boolean;
  showRating?: boolean;
  showVisibility?: boolean;
}

export interface FiltersPanelValues {
  category?: string;
  keywords?: string[];
  search?: string;
  rating?: string;
  visibility?: "all" | "public" | "private";
}

export interface FiltersPanelProps {
  config: FiltersPanelConfig;
  values: FiltersPanelValues;
  onChange: (key: keyof FiltersPanelValues, value: unknown) => void;
  categories?: { category: string }[];
  className?: string;
}

/**
 * Lightweight shared filter bar. For full filter UI (add/remove filters, sections),
 * use the existing items feature filters (FilterSection, etc.); this panel provides
 * a single place to document the shared filter contract and a minimal inline bar.
 */
export function FiltersPanel({
  config,
  values,
  onChange,
  categories = [],
  className = "",
}: FiltersPanelProps) {
  return (
    <div className={`flex flex-wrap items-center gap-4 ${className}`}>
      {config.showSearch && (
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="filters-search" className="block text-xs font-medium text-gray-500 mb-1">
            Search
          </label>
          <input
            id="filters-search"
            type="text"
            value={values.search ?? ""}
            onChange={(e) => onChange("search", e.target.value)}
            placeholder="Search questions..."
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          />
        </div>
      )}
      {config.showCategory && categories.length > 0 && (
        <div>
          <label htmlFor="filters-category" className="block text-xs font-medium text-gray-500 mb-1">
            Category
          </label>
          <select
            id="filters-category"
            value={values.category ?? ""}
            onChange={(e) => onChange("category", e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ))}
          </select>
        </div>
      )}
      {config.showRating && (
        <div>
          <label htmlFor="filters-rating" className="block text-xs font-medium text-gray-500 mb-1">
            Rating
          </label>
          <select
            id="filters-rating"
            value={values.rating ?? "all"}
            onChange={(e) => onChange("rating", e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          >
            <option value="all">Any</option>
            <option value="none">No rating</option>
            <option value="1+">1+</option>
            <option value="2+">2+</option>
            <option value="3+">3+</option>
            <option value="4+">4+</option>
            <option value="5">5</option>
          </select>
        </div>
      )}
      {config.showVisibility && (
        <div>
          <label htmlFor="filters-visibility" className="block text-xs font-medium text-gray-500 mb-1">
            Visibility
          </label>
          <select
            id="filters-visibility"
            value={values.visibility ?? "all"}
            onChange={(e) =>
              onChange("visibility", e.target.value as "all" | "public" | "private")
            }
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          >
            <option value="all">All</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      )}
    </div>
  );
}
