/**
 * Shared category + navigation rank-1 / rank-2 fields for create item, edit item, and bulk AI create.
 * Options come from taxonomy (YAML); navigation paths must be selected, not free-typed.
 */
import { validateNavigationKeywordName } from "@/utils/navigationKeywordRules";

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
  const rank1SelectValue = rank1InList
    ? rank1Options.find((o) => o.toLowerCase() === rank1.trim().toLowerCase()) ?? ""
    : "";
  const rank2SelectValue = rank2InList
    ? rank2Options.find((o) => o.toLowerCase() === rank2.trim().toLowerCase()) ?? ""
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
            onScopeChange({ rank1: v, rank2: "" });
          }}
          disabled={disabled || !category || isLoadingRank1}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">
            {isLoadingRank1 ? "Loading…" : "— Select primary topic —"}
          </option>
          {rank1Options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {rank1.trim() && !rank1InList && !isLoadingRank1 && (
          <p className="mt-1 text-xs text-amber-700">
            Current value is not in the taxonomy list for this category. Choose a valid primary
            topic.
          </p>
        )}
        {rank1Error && rank1InList && (
          <p className="mt-1 text-xs text-red-600">{rank1Error}</p>
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
          onChange={(e) => onScopeChange({ rank2: e.target.value })}
          disabled={disabled || !rank1.trim() || isLoadingRank2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">
            {isLoadingRank2 ? "Loading…" : "— Select subtopic —"}
          </option>
          {rank2Options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {rank2.trim() && !rank2InList && !isLoadingRank2 && rank1InList && (
          <p className="mt-1 text-xs text-amber-700">
            Current value is not valid under this primary topic. Choose a valid subtopic.
          </p>
        )}
        {rank2Error && rank2InList && (
          <p className="mt-1 text-xs text-red-600">{rank2Error}</p>
        )}
      </div>
    </div>
  );
}
