import { FilterPanel } from "./FilterSection";
import type { RatingFilterValue } from "../../types/filters";

interface RatingFilterProps {
  value: RatingFilterValue;
  onChange: (value: RatingFilterValue) => void;
  onRemove: () => void;
}

export const RatingFilter = ({
  value,
  onChange,
  onRemove,
}: RatingFilterProps) => {
  return (
    <FilterPanel label="Rating" onRemove={onRemove}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as RatingFilterValue)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
      >
        <option value="all">All Ratings</option>
        <option value="none">No Rating</option>
        <option value="1+">1+ Stars</option>
        <option value="2+">2+ Stars</option>
        <option value="3+">3+ Stars</option>
        <option value="4+">4+ Stars</option>
        <option value="5">5 Stars</option>
      </select>
      <p className="mt-1 text-xs text-gray-500">
        Filter items by their average rating
      </p>
    </FilterPanel>
  );
};
