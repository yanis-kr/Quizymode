/**
 * Renders a single item in Explore (Flashcards) mode: question face-up; tap/click flips to answer + explanation.
 */
import { useEffect, useState } from "react";
import type { ItemResponse } from "@/types/api";

export interface ExploreRendererProps {
  item: ItemResponse;
}

export function ExploreRenderer({ item }: ExploreRendererProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    setIsFlipped(false);
  }, [item.id]);

  const explanationTrimmed = item.explanation?.trim() ?? "";
  const hasExplanation = explanationTrimmed.length > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <button
        type="button"
        onClick={() => setIsFlipped((f) => !f)}
        aria-expanded={isFlipped}
        aria-label={isFlipped ? "Show question" : "Show answer and explanation"}
        className="group w-full rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        <div className="relative min-h-[12rem] w-full [perspective:1200px]">
          <div
            className={`relative min-h-[12rem] w-full transition-transform duration-500 ease-in-out [transform-style:preserve-3d] ${
              isFlipped ? "[transform:rotateY(180deg)]" : ""
            }`}
          >
            {/* Front: question */}
            <div
              className="absolute inset-0 flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm [backface-visibility:hidden]"
              aria-hidden={isFlipped}
              data-testid="flashcard-front"
            >
              <p className="text-sm font-medium text-gray-500">Question</p>
              <p className="mt-2 flex-1 text-lg text-gray-900">{item.question}</p>
              <p className="mt-4 text-xs text-gray-400">Click the card to reveal the answer</p>
            </div>

            {/* Back: answer + explanation */}
            <div
              className="absolute inset-0 flex flex-col rounded-xl border border-indigo-100 bg-indigo-50/80 p-6 shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]"
              aria-hidden={!isFlipped}
              data-testid="flashcard-back"
            >
              <p className="text-sm font-medium text-gray-500">Answer</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{item.correctAnswer}</p>
              {hasExplanation && (
                <div className="mt-4 border-t border-indigo-200/80 pt-4">
                  <p className="text-sm font-medium text-gray-500">Explanation</p>
                  <p className="mt-2 text-gray-800">{explanationTrimmed}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
