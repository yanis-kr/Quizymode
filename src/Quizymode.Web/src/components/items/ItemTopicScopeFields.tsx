/**
 * Shared category + navigation rank-1 / rank-2 fields for create item, edit item, and bulk AI create.
 */
import {
  validateNavigationKeywordName,
  NAV_KEYWORD_MAX_LEN,
} from "@/utils/navigationKeywordRules";

const CUSTOM_RANK_OPTION = "__custom__";

export type TopicScopePatch = Partial<{
  category: string;
  rank1: string;
  rank2: string;
}>;

export interface ItemTopicScopeFieldsProps {
  /** Prefix for input ids (e.g. item-form, bulk-topic-scope). */
  idPrefix: string;
  categories: { category: string; id?: string }[];
  category: string;
  rank1: string;
  rank2: string;
  onScopeChange: (patch: TopicScopePatch) => void;
  rank1Options: string[];
  rank2Options: string[];
  isLoadingRank1?: boolean;
  isLoadingRank2?: boolean;
  disabled?: boolean;
}

export function ItemTopicScopeFields({
  idPrefix,
  categories,
  category,
  rank1,
  rank2,
  onScopeChange,
  rank1Options,
  rank2Options,
  isLoadingRank1,
  isLoadingRank2,
  disabled = false,
}: ItemTopicScopeFieldsProps) {
  const rank1InList = rank1Options.some(
    (o) => o.toLowerCase() === rank1.trim().toLowerCase()
  );
  const rank2InList = rank2Options.some(
    (o) => o.toLowerCase() === rank2.trim().toLowerCase()
  );
  const rank1SelectValue =
    rank1 && rank1InList
      ? rank1Options.find((o) => o.toLowerCase() === rank1.trim().toLowerCase()) ?? ""
      : rank1.trim()
        ? CUSTOM_RANK_OPTION
        : "";
  const rank2SelectValue =
    rank2 && rank2InList
      ? rank2Options.find((o) => o.toLowerCase() === rank2.trim().toLowerCase()) ?? ""
      : rank2.trim()
        ? CUSTOM_RANK_OPTION
        : "";

  const rank1Error = validateNavigationKeywordName(rank1);
  const rank2Error = validateNavigationKeywordName(rank2);

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor={`${idPrefix}-category`}
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Category *
        </label>
        <select
          id={`${idPrefix}-category`}
          value={category}
          onChange={(e) =>
            onScopeChange({
              category: e.target.value,
              rank1: "",
              rank2: "",
            })
          }
          disabled={disabled}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Select a category</option>
          {categories.map((cat) => (
            <option key={cat.id ?? cat.category} value={cat.category}>
              {cat.category}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-rank1`}
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Primary topic (rank 1) *
        </label>
        <select
          id={`${idPrefix}-rank1`}
          value={rank1SelectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM_RANK_OPTION) {
              onScopeChange({ rank1: "", rank2: "" });
            } else {
              onScopeChange({ rank1: v, rank2: "" });
            }
          }}
          disabled={disabled || !category || isLoadingRank1}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">— Select or add your own —</option>
          {rank1Options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={CUSTOM_RANK_OPTION}>— Create my own (private) —</option>
        </select>
        {(rank1SelectValue === CUSTOM_RANK_OPTION || (rank1.trim() && !rank1InList)) && (
          <>
            <input
              type="text"
              id={`${idPrefix}-rank1-custom`}
              value={rank1}
              onChange={(e) =>
                onScopeChange({
                  rank1: e.target.value.slice(0, NAV_KEYWORD_MAX_LEN),
                })
              }
              placeholder="Private keyword name (letters, numbers, hyphens; max 30)"
              maxLength={NAV_KEYWORD_MAX_LEN}
              disabled={disabled}
              className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            {rank1Error && (
              <p className="mt-1 text-xs text-red-600">{rank1Error}</p>
            )}
          </>
        )}
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-rank2`}
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Subtopic (rank 2) *
        </label>
        <select
          id={`${idPrefix}-rank2`}
          value={rank2SelectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM_RANK_OPTION) {
              onScopeChange({ rank2: "" });
            } else {
              onScopeChange({ rank2: v });
            }
          }}
          disabled={disabled || !rank1.trim() || isLoadingRank2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">— Select or add your own —</option>
          {rank2Options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={CUSTOM_RANK_OPTION}>— Create my own (private) —</option>
        </select>
        {(rank2SelectValue === CUSTOM_RANK_OPTION || (rank2.trim() && !rank2InList)) && (
          <>
            <input
              type="text"
              id={`${idPrefix}-rank2-custom`}
              value={rank2}
              onChange={(e) =>
                onScopeChange({
                  rank2: e.target.value.slice(0, NAV_KEYWORD_MAX_LEN),
                })
              }
              placeholder="Private keyword name (letters, numbers, hyphens; max 30)"
              maxLength={NAV_KEYWORD_MAX_LEN}
              disabled={disabled}
              className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            {rank2Error && (
              <p className="mt-1 text-xs text-red-600">{rank2Error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
