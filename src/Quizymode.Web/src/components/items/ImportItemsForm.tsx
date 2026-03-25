/**
 * Shared import shell for bulk create and upload-to-collection.
 * Provides JSON input, optional scope prefill, and submit area; parent handles API.
 */
export interface ImportItemsFormPrefill {
  category?: string;
  keywords?: string[];
}

export interface ImportItemsFormProps {
  mode: "bulk-create" | "upload-collection";
  prefillScope?: ImportItemsFormPrefill;
  jsonText: string;
  onJsonTextChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  parseError?: string | null;
  /** Optional: AI prompt template for copy */
  promptTemplate?: string;
  onCopyPrompt?: () => void;
  submitLabel?: string;
  className?: string;
}

export function ImportItemsForm({
  mode,
  prefillScope,
  jsonText,
  onJsonTextChange,
  onSubmit,
  isPending,
  parseError,
  promptTemplate,
  onCopyPrompt,
  submitLabel,
  className = "",
}: ImportItemsFormProps) {
  const title =
    mode === "bulk-create"
      ? "Bulk Create Items"
      : "Upload to Collection";
  const defaultSubmitLabel =
    mode === "bulk-create" ? "Create Items" : "Create Collection & Add Items";

  return (
    <div className={`space-y-4 ${className}`}>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {prefillScope && (prefillScope.category || (prefillScope.keywords?.length ?? 0) > 0) && (
        <p className="text-sm text-gray-600">
          Scope: {prefillScope.category ?? "—"}
          {prefillScope.keywords?.length
            ? ` / ${prefillScope.keywords.join(", ")}`
            : ""}
        </p>
      )}
      {promptTemplate && onCopyPrompt && (
        <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            AI prompt (copy and paste into your assistant)
          </label>
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono">
            {promptTemplate}
          </pre>
          <button
            type="button"
            onClick={onCopyPrompt}
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-700"
          >
            Copy prompt
          </button>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            JSON array of items
          </label>
          <textarea
            value={jsonText}
            onChange={(e) => onJsonTextChange(e.target.value)}
            rows={12}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
            placeholder='[{"category":"...","question":"...","correctAnswer":"...","incorrectAnswers":[...],"explanation":"..."}, ...]'
          />
          {parseError && (
            <p className="mt-1 text-sm text-red-600">{parseError}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? "Submitting..." : (submitLabel ?? defaultSubmitLabel)}
        </button>
      </form>
    </div>
  );
}
