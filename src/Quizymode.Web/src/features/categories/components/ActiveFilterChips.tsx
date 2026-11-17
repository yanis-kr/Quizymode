import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ActiveFilterChip } from "../utils/activeFilterChips";

interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[];
  /** Optional display name per chip, keyed by lower-case keyword slug. */
  displayNames?: Record<string, string>;
  onRemove: (chip: ActiveFilterChip) => void;
}

export function ActiveFilterChips({ chips, displayNames, onRemove }: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div role="group" aria-label="Active filters" className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active filters</span>
      {chips.map((chip) => {
        const name = displayNames?.[chip.keyword.toLowerCase()] ?? chip.keyword;
        return (
          <button
            key={`${chip.kind}-${chip.keyword.toLowerCase()}`}
            type="button"
            aria-label={`Remove filter ${name}`}
            data-kind={chip.kind}
            onClick={() => onRemove(chip)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800 hover:bg-indigo-200"
          >
            <span>{name}</span>
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
