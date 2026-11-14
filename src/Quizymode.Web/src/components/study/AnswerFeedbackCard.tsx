import { useEffect, useRef, type MouseEvent } from "react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/solid";
import type { ItemResponse } from "@/types/api";
import { ForeignPhraseText } from "@/components/ForeignPhraseText";
import { SpeakButton } from "@/components/SpeakButton";
import { PronunciationHint } from "@/components/items/PronunciationHint";
import { QuestionImage } from "@/components/study/QuestionImage";
import { useSpeech } from "@/hooks/useSpeech";
import { getOptionRationale } from "@/utils/itemSpeech";

interface AnswerFeedbackCardProps {
  item: ItemResponse;
  /** The option the learner chose. */
  selectedAnswer: string;
  isCorrect: boolean;
  /** The "Did you know?" fact; the label and block are omitted when empty. */
  fact?: string | undefined;
  /** "See my score" instead of "Next". */
  isLast: boolean;
  /** Primary action; without it the card shows no button (nothing to advance to). */
  onNext?: (() => void) | undefined;
  /** Shown where Next would be when there is nothing to advance to (for example "1 question left. Use Previous to answer it."); it takes focus. */
  noNextHint?: string | undefined;
  /** Starter only: a click or tap anywhere on the card advances. Clicks from a button or link inside never do. */
  advanceOnCardClick?: boolean;
}

/**
 * The single answer-feedback card shared by /start, /daily, /review and /quiz choice answers (#648): the verdict, what the
 * learner picked on a miss (with the reason it is wrong), the correct answer, one fact under "Did you know?" and the
 * explanation picture. Rendered inside the quiz's one polite live region. The real Next button is focused one frame later
 * so Enter advances exactly once (the study hotkeys ignore events from a focused button).
 */
export function AnswerFeedbackCard({
  item,
  selectedAnswer,
  isCorrect,
  fact,
  isLast,
  onNext,
  noNextHint,
  advanceOnCardClick = false,
}: AnswerFeedbackCardProps) {
  const nextRef = useRef<HTMLButtonElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const { isSupported } = useSpeech();
  const hasNext = onNext !== undefined;
  const rationale = isCorrect
    ? undefined
    : getOptionRationale(item.incorrectAnswers, item.incorrectAnswerRationale, selectedAnswer);

  // The text is already in the live region when this mounts; focus moves one frame later so it is announced first.
  useEffect(() => {
    if (!hasNext) return;
    const frame = requestAnimationFrame(() => nextRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [hasNext]);

  // No Next: focus the hint so focus never drops to the page body (the hint is inside the live region).
  const hasHint = !hasNext && Boolean(noNextHint);
  useEffect(() => {
    if (!hasHint) return;
    const frame = requestAnimationFrame(() => hintRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [hasHint]);

  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!advanceOnCardClick || !onNext) return;
    const origin = event.target instanceof Element ? event.target.closest("button, a") : null;
    if (origin) return;
    onNext();
  };

  return (
    <div
      data-testid="answer-feedback-card"
      onClick={advanceOnCardClick ? handleCardClick : undefined}
      className={`rounded-lg border-2 p-3 ${advanceOnCardClick ? "cursor-pointer " : ""}${
        isCorrect
          ? "border-green-500 bg-green-50 motion-safe:animate-correct-pulse"
          : "border-red-500 bg-red-50 motion-safe:animate-wrong-shake"
      }`}
    >
      <div className="flex items-center gap-2">
        {isCorrect ? (
          <CheckCircleIcon className="h-6 w-6 shrink-0 text-green-600" aria-hidden="true" />
        ) : (
          <XCircleIcon className="h-6 w-6 shrink-0 text-red-600" aria-hidden="true" />
        )}
        <p className="text-base font-semibold text-gray-900">{isCorrect ? "Correct!" : "Not quite."}</p>
      </div>
      {!isCorrect && (
        <p className="mt-1 break-words text-sm text-gray-600">
          You picked: <ForeignPhraseText text={selectedAnswer} />
        </p>
      )}
      {rationale && (
        <p className="mt-1 break-words text-sm text-red-800" data-testid="option-rationale">
          <ForeignPhraseText text={rationale} />
        </p>
      )}
      <div className="mt-1 flex items-start gap-2">
        <p className="min-w-0 break-words text-sm font-semibold text-gray-900">
          Answer: <ForeignPhraseText text={item.correctAnswer} />
        </p>
        <SpeakButton
          text={item.correctAnswer}
          speech={item.correctAnswerSpeech}
          isSupported={isSupported}
          label="Read answer aloud"
        />
      </div>
      <PronunciationHint
        text={item.correctAnswer}
        speech={item.correctAnswerSpeech}
        className="mt-1 text-sm text-gray-500 italic"
      />
      {fact && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-ink">Did you know?</p>
          <p className="mt-0.5 break-words text-sm text-gray-800">
            <ForeignPhraseText text={fact} linkify />
          </p>
        </div>
      )}
      {/* Mounted only inside the revealed card: the picture can show the answer (#403). Nothing renders without one. */}
      <QuestionImage
        key={`${item.id}-explanation`}
        itemId={item.id}
        image={item.explanationImage}
        slot="explanation"
        className="mt-3 max-h-48 rounded-lg bg-surface sm:max-h-72"
      />
      {hasHint && (
        <p ref={hintRef} tabIndex={-1} data-testid="answer-card-hint" className="mt-3 text-sm font-semibold text-gray-800 focus:outline-none">
          {noNextHint}
        </p>
      )}
      {hasNext && (
        <div className="mt-3 flex">
          <button
            ref={nextRef}
            type="button"
            onClick={onNext}
            className="min-h-[44px] w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 sm:ml-auto sm:w-auto"
          >
            {isLast ? "See my score" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}
