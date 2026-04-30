/**
 * Renders a single item in Explore (Flashcards) mode: question face-up; tap/click flips to answer + explanation.
 */
import { useEffect, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type { ItemResponse } from "@/types/api";
import { SpeakButton } from "@/components/SpeakButton";
import { useSpeech } from "@/hooks/useSpeech";
import { PronunciationHint } from "@/components/items/PronunciationHint";
import { ForeignPhraseText } from "@/components/ForeignPhraseText";

/** Characters beyond which the explanation is truncated with a "Show more" toggle. */
const EXPLANATION_CLAMP_THRESHOLD = 220;

export interface ExploreRendererProps {
  item: ItemResponse;
}

export function ExploreRenderer({ item }: ExploreRendererProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [explanationExpanded, setExplanationExpanded] = useState(false);
  const { isSupported } = useSpeech();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsFlipped(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExplanationExpanded(false);
  }, [item.id]);

  const explanationTrimmed = item.explanation?.trim() ?? "";
  const hasExplanation = explanationTrimmed.length > 0;
  const isLongExplanation = explanationTrimmed.length > EXPLANATION_CLAMP_THRESHOLD;

  return (
    <div className="mx-auto max-w-2xl">
      {/*
        Outer container sets the minimum card height. Whichever face is
        currently visible is in normal document flow (drives height); the
        hidden face is pulled out of flow with absolute positioning so it
        doesn't affect layout.
      */}
      <div className="relative min-h-[12rem]">

        {/* ── Front face: question ── */}
        <div
          className={`rounded-xl border border-gray-200 bg-white shadow-sm transition-opacity duration-300 ${
            isFlipped ? "absolute inset-0 opacity-0 pointer-events-none select-none" : "opacity-100"
          }`}
          aria-hidden={isFlipped}
          data-testid="flashcard-front"
        >
          {/* Label row with speak button — sits outside the flip button so there is no nested-button issue */}
          <div className="flex items-center justify-between px-6 pt-6 pb-0">
            <p className="text-sm font-medium text-gray-500">Question</p>
            <SpeakButton
              text={item.question}
              speech={item.questionSpeech}
              isSupported={isSupported}
              label="Read question aloud"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsFlipped(true)}
            aria-expanded={false}
            aria-label="Show answer and explanation"
            className="w-full rounded-b-xl px-6 pb-6 pt-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <div className="flex-1">
              <p className="text-lg text-gray-900">
                <ForeignPhraseText text={item.question} />
              </p>
              <PronunciationHint text={item.question} speech={item.questionSpeech} />
            </div>
            <p className="mt-4 text-xs text-gray-400">Click the card to reveal the answer</p>
          </button>
        </div>

        {/* ── Back face: answer + explanation ── */}
        <div
          className={`rounded-xl border border-indigo-100 bg-indigo-50/80 shadow-sm transition-opacity duration-300 ${
            !isFlipped ? "absolute inset-0 opacity-0 pointer-events-none select-none" : "opacity-100"
          }`}
          aria-hidden={!isFlipped}
          data-testid="flashcard-back"
        >
          {/* Label row with speak button — sits outside the flip button */}
          <div className="flex items-center justify-between px-6 pt-6 pb-0">
            <p className="text-sm font-medium text-gray-500">Answer</p>
            <SpeakButton
              text={item.correctAnswer}
              speech={item.correctAnswerSpeech}
              isSupported={isSupported}
              label="Read answer aloud"
            />
          </div>
          {/* Tapping the answer section flips back to the question */}
          <button
            type="button"
            onClick={() => setIsFlipped(false)}
            aria-expanded={isFlipped}
            aria-label="Show question"
            className="w-full rounded-none px-6 pb-2 pt-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <div>
              <p className="text-lg font-semibold text-gray-900">
                <ForeignPhraseText text={item.correctAnswer} />
              </p>
              <PronunciationHint text={item.correctAnswer} speech={item.correctAnswerSpeech} />
            </div>
            <p className="mt-2 text-xs text-gray-400">Click to show question</p>
          </button>

          {hasExplanation && (
            <div className="border-t border-indigo-200/80 px-6 pb-6 pt-4">
              <p className="text-sm font-medium text-gray-500">Explanation</p>
              <p
                className={`mt-2 text-gray-800 ${
                  isLongExplanation && !explanationExpanded ? "line-clamp-3" : ""
                }`}
              >
                <ForeignPhraseText text={explanationTrimmed} linkify />
              </p>
              {isLongExplanation && (
                <button
                  type="button"
                  onClick={() => setExplanationExpanded((e) => !e)}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 rounded"
                >
                  {explanationExpanded ? "Show less" : "Show more"}
                  <ChevronDownIcon
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      explanationExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
              )}
            </div>
          )}

          {!hasExplanation && <div className="pb-4" />}
        </div>
      </div>
    </div>
  );
}
