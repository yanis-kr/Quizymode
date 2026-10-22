import * as React from "react";
import {
  DEFAULT_PARSE_OPTIONS,
  buildImportItems,
  parseTermPairs,
  type ImportDirection,
  type ImportItem,
  type SeparatorKind,
} from "../utils/importParser";

interface PasteTextImportProps {
  /** Upload limit for this user (100 for regular users, 1000 for admins). */
  maxItems: number;
  isPending: boolean;
  /** Called with the previewed items and a stable text used for duplicate-upload detection. */
  onImport: (items: ImportItem[], inputText: string) => void;
}

const PREVIEW_ROWS = 5;
const inputClass =
  "block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm";

const PasteTextImport = ({ maxItems, isPending, onImport }: PasteTextImportProps) => {
  const [text, setText] = React.useState("");
  const [separator, setSeparator] = React.useState<SeparatorKind>("auto");
  const [customSeparator, setCustomSeparator] = React.useState("");
  const [quotes, setQuotes] = React.useState(true);
  const [direction, setDirection] = React.useState<ImportDirection>("term-to-definition");
  const [template, setTemplate] = React.useState("{term}");

  const preview = React.useMemo(() => {
    if (!text.trim()) return null;
    const parsed = parseTermPairs(text, { ...DEFAULT_PARSE_OPTIONS, separator, customSeparator, quotes });
    const built = buildImportItems(parsed.pairs, { direction, template, limit: maxItems });
    return { parsed, built, skipped: [...parsed.skipped, ...built.skipped] };
  }, [text, separator, customSeparator, quotes, direction, template, maxItems]);

  const canImport = !!preview && !preview.built.error && preview.built.items.length > 0 && !isPending;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Paste a Quizlet export (term, tab, definition), an Anki text export, or CSV/TSV. Quizlet links and Anki .apkg
        files are not supported. Wrong answers are picked from the other answers in the same set, so at least 4 usable
        rows are needed.
      </p>

      <div>
        <label htmlFor="paste-text" className="block text-sm font-medium text-gray-700 mb-1">
          Pasted text
        </label>
        <textarea
          id="paste-text"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`${inputClass} font-mono`}
          placeholder={"cat\tgato\ndog\tperro\nbird\tpájaro\nfish\tpez"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="paste-separator" className="block text-sm font-medium text-gray-700 mb-1">
            Separator
          </label>
          <select
            id="paste-separator"
            value={separator}
            onChange={(e) => setSeparator(e.target.value as SeparatorKind)}
            className={inputClass}
          >
            <option value="auto">Auto-detect (tab, otherwise comma)</option>
            <option value="tab">Tab</option>
            <option value="comma">Comma</option>
            <option value="semicolon">Semicolon</option>
            <option value="pipe">Pipe |</option>
            <option value="custom">Custom text</option>
          </select>
        </div>
        {separator === "custom" && (
          <div>
            <label htmlFor="paste-custom-separator" className="block text-sm font-medium text-gray-700 mb-1">
              Custom separator
            </label>
            <input
              id="paste-custom-separator"
              type="text"
              value={customSeparator}
              onChange={(e) => setCustomSeparator(e.target.value)}
              className={inputClass}
              placeholder=" - "
            />
          </div>
        )}
        <div>
          <label htmlFor="paste-direction" className="block text-sm font-medium text-gray-700 mb-1">
            Direction
          </label>
          <select
            id="paste-direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as ImportDirection)}
            className={inputClass}
          >
            <option value="term-to-definition">Term as question, definition as answer</option>
            <option value="definition-to-term">Definition as question, term as answer</option>
          </select>
        </div>
        <div>
          <label htmlFor="paste-template" className="block text-sm font-medium text-gray-700 mb-1">
            Question template (optional)
          </label>
          <input
            id="paste-template"
            type="text"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className={inputClass}
            placeholder="Define: {term}"
          />
          <p className="mt-1 text-xs text-gray-500">{"{term}"} is replaced by the question side of each row.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={quotes}
          onChange={(e) => setQuotes(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600"
        />
        Treat double quotes as field quotes (CSV)
      </label>

      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        <h2 className="font-medium text-gray-900">Preview</h2>
        {!preview && <p className="text-gray-500">Paste text above to see a preview.</p>}
        {preview && (
          <div className="space-y-2">
            <p aria-live="polite">
              {preview.built.items.length} item{preview.built.items.length === 1 ? "" : "s"} ready
              {preview.skipped.length > 0 && `, ${preview.skipped.length} row${preview.skipped.length === 1 ? "" : "s"} skipped`}
              {preview.built.duplicates > 0 &&
                `, ${preview.built.duplicates} duplicate${preview.built.duplicates === 1 ? "" : "s"} removed`}
              .
            </p>
            {preview.built.error && (
              <p role="alert" className="text-red-700">
                {preview.built.error}
              </p>
            )}
            {preview.built.truncated > 0 && (
              <p role="alert" className="text-amber-700">
                Your limit is {maxItems} items per upload, so only the first {maxItems} will be imported. Split the
                rest into another upload.
              </p>
            )}
            {preview.built.items.length > 0 && (
              <ul className="space-y-2">
                {preview.built.items.slice(0, PREVIEW_ROWS).map((item, i) => (
                  <li key={i} className="break-words rounded border border-gray-200 bg-white p-2">
                    <div className="font-medium text-gray-900">{item.question}</div>
                    <div className="text-green-700">{item.correctAnswer}</div>
                    <div className="text-xs text-gray-500">Wrong: {item.incorrectAnswers.join(" | ")}</div>
                  </li>
                ))}
              </ul>
            )}
            {preview.skipped.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-gray-600">Skipped rows</summary>
                <ul className="mt-1 list-disc pl-5 text-xs text-gray-600">
                  {preview.skipped.slice(0, 20).map((s, i) => (
                    <li key={i}>
                      Row {s.row}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!canImport}
        onClick={() => {
          if (preview && canImport) onImport(preview.built.items, JSON.stringify(preview.built.items));
        }}
        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Uploading…" : "Upload and open collection"}
      </button>
    </div>
  );
};

export default PasteTextImport;
