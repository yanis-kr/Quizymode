/**
 * Shared form for creating and editing quiz items. Used by CreateItemPage and EditItemPage.
 */
import { useState } from "react";
import type { KeywordRequest } from "@/types/api";
import ErrorMessage from "@/components/ErrorMessage";

export interface ItemFormValues {
  category: string;
  isPrivate: boolean;
  /** Navigation keyword rank 1 (from dropdown or custom private). */
  navigationRank1: string;
  /** Navigation keyword rank 2 (from dropdown or custom private). */
  navigationRank2: string;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation: string;
  keywords: KeywordRequest[];
  source: string;
}

export interface ItemFormProps {
  mode: "create" | "edit";
  values: ItemFormValues;
  onChange: (values: ItemFormValues) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  categories: { category: string }[];
  /** Rank-1 navigation keyword names for the selected category (for dropdown). */
  rank1Options?: string[];
  /** Rank-2 navigation keyword names for the selected rank1 (for dropdown). */
  rank2Options?: string[];
  isLoadingRank1?: boolean;
  isLoadingRank2?: boolean;
  isAdmin: boolean;
  isPending: boolean;
  validationError?: string;
  submitError?: string;
  onDismissSubmitError?: () => void;
}

const CUSTOM_RANK_OPTION = "__custom__";

export function ItemForm({
  mode,
  values,
  onChange,
  onSubmit,
  onCancel,
  categories,
  rank1Options = [],
  rank2Options = [],
  isLoadingRank1,
  isLoadingRank2,
  isAdmin,
  isPending,
  validationError,
  submitError,
  onDismissSubmitError,
}: ItemFormProps) {
  const [newKeywordName, setNewKeywordName] = useState("");
  const [newKeywordIsPrivate, setNewKeywordIsPrivate] = useState(true);

  const rank1InList = rank1Options.some(
    (o) => o.toLowerCase() === values.navigationRank1.trim().toLowerCase()
  );
  const rank2InList = rank2Options.some(
    (o) => o.toLowerCase() === values.navigationRank2.trim().toLowerCase()
  );
  const rank1SelectValue =
    values.navigationRank1 && rank1InList
      ? rank1Options.find((o) => o.toLowerCase() === values.navigationRank1.trim().toLowerCase()) ?? ""
      : values.navigationRank1.trim()
        ? CUSTOM_RANK_OPTION
        : "";
  const rank2SelectValue =
    values.navigationRank2 && rank2InList
      ? rank2Options.find((o) => o.toLowerCase() === values.navigationRank2.trim().toLowerCase()) ?? ""
      : values.navigationRank2.trim()
        ? CUSTOM_RANK_OPTION
        : "";

  const addKeyword = () => {
    const trimmedName = newKeywordName.trim().toLowerCase();
    if (trimmedName.length === 0 || trimmedName.length > 10) return;
    if (
      values.keywords.some(
        (k) =>
          k.name.toLowerCase() === trimmedName && k.isPrivate === newKeywordIsPrivate
      )
    )
      return;
    onChange({
      ...values,
      keywords: [
        ...values.keywords,
        { name: trimmedName, isPrivate: newKeywordIsPrivate },
      ],
    });
    setNewKeywordName("");
    setNewKeywordIsPrivate(!isAdmin);
  };

  const removeKeyword = (index: number) => {
    onChange({
      ...values,
      keywords: values.keywords.filter((_, i) => i !== index),
    });
  };

  const handleIncorrectAnswerChange = (index: number, value: string) => {
    const newAnswers = [...values.incorrectAnswers];
    newAnswers[index] = value;
    onChange({ ...values, incorrectAnswers: newAnswers });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white shadow rounded-lg p-6 space-y-6"
    >
      {validationError && (
        <ErrorMessage message={validationError} />
      )}
      {submitError && (
        <ErrorMessage
          message={submitError}
          onRetry={onDismissSubmitError ?? undefined}
        />
      )}

      <div>
        <label htmlFor="item-form-category" className="block text-sm font-medium text-gray-700 mb-2">
          Category *
        </label>
        <select
          id="item-form-category"
          value={values.category}
          onChange={(e) => onChange({ ...values, category: e.target.value })}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Select a category</option>
          {categories.map((cat) => (
            <option key={cat.category} value={cat.category}>
              {cat.category}
            </option>
          ))}
        </select>
      </div>

      {rank1Options.length >= 0 && (
        <>
          <div>
            <label htmlFor="item-form-rank1" className="block text-sm font-medium text-gray-700 mb-2">
              Navigation keyword rank 1
            </label>
            <select
              id="item-form-rank1"
              value={rank1SelectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === CUSTOM_RANK_OPTION) {
                  onChange({ ...values, navigationRank1: "", navigationRank2: "" });
                } else {
                  onChange({ ...values, navigationRank1: v, navigationRank2: "" });
                }
              }}
              disabled={!values.category || isLoadingRank1}
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
            {(rank1SelectValue === CUSTOM_RANK_OPTION || (values.navigationRank1.trim() && !rank1InList)) && (
              <input
                type="text"
                value={values.navigationRank1}
                onChange={(e) => onChange({ ...values, navigationRank1: e.target.value.slice(0, 30) })}
                placeholder="Private keyword name (max 30 chars)"
                maxLength={30}
                className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            )}
          </div>
          <div>
            <label htmlFor="item-form-rank2" className="block text-sm font-medium text-gray-700 mb-2">
              Navigation keyword rank 2
            </label>
            <select
              id="item-form-rank2"
              value={rank2SelectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === CUSTOM_RANK_OPTION) {
                  onChange({ ...values, navigationRank2: "" });
                } else {
                  onChange({ ...values, navigationRank2: v });
                }
              }}
              disabled={!values.navigationRank1.trim() || isLoadingRank2}
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
            {(rank2SelectValue === CUSTOM_RANK_OPTION || (values.navigationRank2.trim() && !rank2InList)) && (
              <input
                type="text"
                value={values.navigationRank2}
                onChange={(e) => onChange({ ...values, navigationRank2: e.target.value.slice(0, 30) })}
                placeholder="Private keyword name (max 30 chars)"
                maxLength={30}
                className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            )}
          </div>
        </>
      )}

      <div>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={values.isPrivate}
            onChange={(e) =>
              onChange({ ...values, isPrivate: e.target.checked })
            }
            disabled={!isAdmin}
            className="mr-2"
          />
          <span className="text-sm font-medium text-gray-700">
            Private Item {!isAdmin && "(default for regular users)"}
          </span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Question *
        </label>
        <textarea
          value={values.question}
          onChange={(e) => onChange({ ...values, question: e.target.value })}
          required
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Correct Answer *
        </label>
        <input
          type="text"
          value={values.correctAnswer}
          onChange={(e) =>
            onChange({ ...values, correctAnswer: e.target.value })
          }
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Incorrect Answers (at least 1 required) *
        </label>
        {values.incorrectAnswers.map((answer, index) => (
          <input
            key={index}
            type="text"
            value={answer}
            onChange={(e) =>
              handleIncorrectAnswerChange(index, e.target.value)
            }
            placeholder={`Incorrect answer ${index + 1}`}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
          />
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Explanation
        </label>
        <textarea
          value={values.explanation}
          onChange={(e) =>
            onChange({ ...values, explanation: e.target.value })
          }
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Source (optional)
        </label>
        <input
          type="text"
          value={values.source}
          onChange={(e) => onChange({ ...values, source: e.target.value })}
          maxLength={200}
          placeholder="e.g., ChatGPT, Claude, Manual"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Keywords (optional, max 10 characters each)
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newKeywordName}
            onChange={(e) =>
              setNewKeywordName(e.target.value.slice(0, 10))
            }
            placeholder="Keyword name (max 10 chars)"
            maxLength={10}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
          />
          <label className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm">
            <input
              type="checkbox"
              checked={newKeywordIsPrivate}
              onChange={(e) => setNewKeywordIsPrivate(e.target.checked)}
              disabled={!isAdmin}
              className="mr-2"
            />
            Private
          </label>
          <button
            type="button"
            onClick={addKeyword}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
          >
            Add
          </button>
        </div>
        {values.keywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {values.keywords.map((keyword, index) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
              >
                {keyword.name}
                {keyword.isPrivate && <span className="ml-1 text-xs">🔒</span>}
                <button
                  type="button"
                  onClick={() => removeKeyword(index)}
                  className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-200"
                  aria-label={`Remove ${keyword.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
            ? "Create Item"
            : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
