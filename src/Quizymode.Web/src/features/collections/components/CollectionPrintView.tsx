import type { ExportableItem } from "../utils/exportFormats";

interface CollectionPrintViewProps {
  title: string;
  items: readonly ExportableItem[];
  /** Worksheet mode: show a blank answer line instead of the answer and explanation. */
  hideAnswers: boolean;
}

/** Hidden on screen; shown only when printing (Tailwind `print:` utilities). */
export const CollectionPrintView = ({ title, items, hideAnswers }: CollectionPrintViewProps) => (
  <section data-testid="collection-print-view" className="hidden text-black print:block">
    <h1 className="mb-4 text-2xl font-bold">{title}</h1>
    <ol className="list-decimal space-y-4 pl-6">
      {items.map((item, index) => (
        <li key={index} className="break-inside-avoid">
          <p className="font-medium">{item.question}</p>
          {hideAnswers ? (
            <p className="mt-2 border-b border-black pb-4">Answer:</p>
          ) : (
            <>
              <p>
                <span className="font-semibold">Answer:</span> {item.correctAnswer}
              </p>
              {item.explanation && item.explanation.trim() !== "" && (
                <p className="text-sm">
                  <span className="font-semibold">Explanation:</span> {item.explanation}
                </p>
              )}
            </>
          )}
        </li>
      ))}
    </ol>
  </section>
);
