import type { ExportableItem } from "../utils/exportFormats";
import { resolveCuratedImage } from "@/media/curatedImages";

interface CollectionPrintViewProps {
  title: string;
  items: readonly ExportableItem[];
  /** Worksheet mode: show a blank answer line instead of the answer and explanation. */
  hideAnswers: boolean;
}

function PrintedPicture({ image }: { image: NonNullable<ExportableItem["questionImage"]> }) {
  const url = resolveCuratedImage(image.key);
  if (url === null) {
    return <p className="text-sm italic">[Picture unavailable: {image.altText}]</p>;
  }
  return (
    <img
      src={url}
      alt={image.altText}
      loading="eager"
      className="mt-2 h-32 w-48 border border-gray-400 bg-slate-200 object-contain p-1 print:[print-color-adjust:exact] break-inside-avoid"
    />
  );
}

/** Hidden on screen; shown only when printing (Tailwind `print:` utilities). */
export const CollectionPrintView = ({ title, items, hideAnswers }: CollectionPrintViewProps) => (
  <section data-testid="collection-print-view" className="hidden text-black print:block">
    <h1 className="mb-4 text-2xl font-bold">{title}</h1>
    <ol className="list-decimal space-y-4 pl-6">
      {items.map((item, index) => (
        <li key={index} className="break-inside-avoid">
          <p className="font-medium">{item.question}</p>
          {item.questionImage && <PrintedPicture image={item.questionImage} />}
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
