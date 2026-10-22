import {
  downloadTextFile,
  exportFileName,
  toCsv,
  toQuizletText,
  toTsv,
  type ExportableItem,
} from "../utils/exportFormats";

interface CollectionExportControlsProps {
  items: readonly ExportableItem[];
  collectionName: string | null | undefined;
  hideAnswers: boolean;
  onHideAnswersChange: (hide: boolean) => void;
}

const buttonClass =
  "inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

export const CollectionExportControls = ({
  items,
  collectionName,
  hideAnswers,
  onHideAnswersChange,
}: CollectionExportControlsProps) => (
  <section
    aria-label="Export and print"
    className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/90 p-3"
  >
    <button
      type="button"
      className={buttonClass}
      onClick={() => downloadTextFile(exportFileName(collectionName, "csv"), toCsv(items), "text/csv", true)}
    >
      Download CSV
    </button>
    <button
      type="button"
      className={buttonClass}
      onClick={() =>
        downloadTextFile(exportFileName(collectionName, "tsv"), toTsv(items), "text/tab-separated-values", true)
      }
    >
      Download TSV
    </button>
    <button
      type="button"
      className={buttonClass}
      onClick={() => downloadTextFile(exportFileName(collectionName, "txt"), toQuizletText(items), "text/plain", false)}
    >
      Quizlet text
    </button>
    <button type="button" className={buttonClass} onClick={() => window.print()}>
      Print
    </button>
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={hideAnswers}
        onChange={(e) => onHideAnswersChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
      />
      Hide answers when printing (worksheet)
    </label>
  </section>
);
