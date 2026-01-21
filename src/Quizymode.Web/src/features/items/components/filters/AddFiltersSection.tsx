import { AddFilterButton } from "./FilterSection";
import type { FilterType } from "../../types/filters";

interface AddFiltersSectionProps {
  availableFilters: FilterType[];
  onAddFilter: (filterType: FilterType) => void;
}

export const AddFiltersSection = ({
  availableFilters,
  onAddFilter,
}: AddFiltersSectionProps) => {
  const filterLabels: Record<FilterType, string> = {
    itemType: "Item Type",
    category: "Category",
    keywords: "Keywords",
    search: "Text Search",
    rating: "Rating",
  };

  if (availableFilters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-sm font-medium text-gray-700">Add Filter:</span>
      {availableFilters.map((filterType) => (
        <AddFilterButton
          key={filterType}
          onClick={() => onAddFilter(filterType)}
          label={filterLabels[filterType]}
        />
      ))}
    </div>
  );
};
