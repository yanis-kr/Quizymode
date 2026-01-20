import { FilterPanel } from "./FilterSection";
import type { ItemTypeFilter } from "../../types/filters";

interface ItemTypeFilterProps {
  value: ItemTypeFilter;
  onChange: (value: ItemTypeFilter) => void;
  onRemove: () => void;
}

export const ItemTypeFilter = ({
  value,
  onChange,
  onRemove,
}: ItemTypeFilterProps) => {
  return (
    <FilterPanel label="Item Type" onRemove={onRemove}>
      <div className="flex space-x-4">
        <button
          onClick={() => onChange("all")}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            value === "all"
              ? "bg-indigo-600 text-white"
              : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
          }`}
        >
          All
        </button>
        <button
          onClick={() => onChange("public")}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            value === "public"
              ? "bg-indigo-600 text-white"
              : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
          }`}
        >
          Public
        </button>
        <button
          onClick={() => onChange("private")}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            value === "private"
              ? "bg-indigo-600 text-white"
              : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
          }`}
        >
          Private
        </button>
      </div>
    </FilterPanel>
  );
};
