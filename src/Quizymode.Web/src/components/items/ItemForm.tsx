/**
 * Shared form for creating and editing quiz items. Used by CreateItemPage and EditItemPage.
 */
import { useState } from "react";
import type { KeywordRequest } from "@/types/api";
import ErrorMessage from "@/components/ErrorMessage";
import { ItemTopicScopeFields } from "@/components/items/ItemTopicScopeFields";

export interface ItemFormValues {
  category: string;
  isPrivate: boolean;
  /** Navigation keyword rank 1 (from dropdown or custom private). */
  navigationRank1: string;
  /** Navigation keyword rank 2 (from dropdown or custom private). */
  navigationRank2: string;
  /** Whether the owner is requesting admin review to make the item public. */
  readyForReview: boolean;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation: string;
  keywords: KeywordRequest[];
  source: string;
  /** Optional factual risk 0–1. */
  factualRisk: string;
  /** Optional review notes. */
  reviewComments: string;
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

      <section className="rounded-lg border border-gray-200 bg-slate-50/80 p-4 sm:p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Topic and tags</h2>
          <p className="mt-1 text-xs text-gray-500">
            Category, primary topic, and subtopic define where the item appears when browsing. Extra
            keywords are optional tags for finer search.
          </p>
        </div>
        <ItemTopicScopeFields
          idPrefix="item-form"
          categories={categories}
          category={values.category}
          rank1={values.navigationRank1}
          rank2={values.navigationRank2}
          onScopeChange={(patch) =>
            onChange({
              ...values,
              ...(patch.category !== undefined && { category: patch.category }),
              ...(patch.rank1 !== undefined && { navigationRank1: patch.rank1 }),
              ...(patch.rank2 !== undefined && { navigationRank2: patch.rank2 }),
            })
          }
          rank1Options={rank1Options}
          rank2Options={rank2Options}
          isLoadingRank1={isLoadingRank1}
          isLoadingRank2={isLoadingRank2}
        />
        <div className="pt-4 border-t border-gray-200/90">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Additional keywords (optional, max 10 characters each)
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
      </section>

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

      {!isAdmin && (
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={values.readyForReview}
              onChange={(e) =>
                onChange({ ...values, readyForReview: e.target.checked })
              }
              className="mr-2"
            />
            <span className="text-sm font-medium text-gray-700">
              Request admin review to make this item public
            </span>
          </label>
        </div>
      )}

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

      {isAdmin && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Factual risk (optional, 0–1)
            </label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={values.factualRisk}
              onChange={(e) =>
                onChange({ ...values, factualRisk: e.target.value })
              }
              placeholder="e.g. 0.2"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Review comments (optional)
            </label>
            <textarea
              value={values.reviewComments}
              onChange={(e) =>
                onChange({
                  ...values,
                  reviewComments: e.target.value.slice(0, 500),
                })
              }
              maxLength={500}
              rows={2}
              placeholder="Uncertainty, assumptions, outdated info..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </>
      )}

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
