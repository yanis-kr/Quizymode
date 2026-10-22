/**
 * Renders a single item in Quiz mode: question, answer options, feedback.
 */
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/solid";
import type { ItemResponse } from "@/types/api";
import { SpeakButton } from "@/components/SpeakButton";
import { useSpeech } from "@/hooks/useSpeech";
import { PronunciationHint } from "@/components/items/PronunciationHint";
import { ForeignPhraseText } from "@/components/ForeignPhraseText";
import { getIndexedSpeech } from "@/utils/itemSpeech";

export interface QuizRendererProps {
  item: ItemResponse;
  options: string[];
  selectedAnswer: string | null;
  showAnswer: boolean;
  onAnswerSelect: (answer: string) => void;
  stats: { total: number; correct: number };
  /**
   * False for an unsubmitted Test (AC 3.18.3): options stay selectable, the selection is neutral
   * (aria-pressed), and no correctness, answer panel, score line or option pronunciation hint renders.
   */
  revealFeedback?: boolean;
}

export function QuizRenderer({
  item,
  options,
  selectedAnswer,
  showAnswer,
  onAnswerSelect,
  stats,
  revealFeedback = true,
}: QuizRendererProps) {
  const { isSupported } = useSpeech();

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <h3 className="text-base font-medium text-gray-900">Question</h3>
          <SpeakButton
            text={item.question}
            speech={item.questionSpeech}
            isSupported={isSupported}
            label="Read question aloud"
          />
        </div>
        <p className="text-gray-700"><ForeignPhraseText text={item.question} /></p>
        <PronunciationHint text={item.question} speech={item.questionSpeech} />
      </div>

      <div>
        <h3 className="text-base font-medium text-gray-900 mb-1">
          Select an answer:
        </h3>
        <div className="space-y-1.5">
          {options.map((option, index) => {
            const letter = String.fromCharCode(65 + index);
            const isCorrect = option === item.correctAnswer;
            const isSelected = selectedAnswer === option;
            const optionSpeech = isCorrect
              ? item.correctAnswerSpeech
              : getIndexedSpeech(
                  item.incorrectAnswerSpeech,
                  item.incorrectAnswers.findIndex((candidate) => candidate === option)
                );
            let bgColor = "bg-white hover:bg-gray-50";
            let motion = "";
            const showsCorrect = revealFeedback && showAnswer && isCorrect;
            const showsWrong = revealFeedback && showAnswer && isSelected && !isCorrect;
            const isNeutralSelected = !revealFeedback && isSelected;
            if (isNeutralSelected) {
              bgColor = "bg-slate-100 border-slate-700 ring-1 ring-slate-700";
            }
            if (showsCorrect) {
              bgColor = "bg-green-100 border-green-500";
              motion = "motion-safe:animate-correct-pulse";
            } else if (showsWrong) {
              bgColor = "bg-red-100 border-red-500";
              motion = "motion-safe:animate-wrong-shake";
            }

            return (
              <button
                key={index}
                type="button"
                onClick={() => onAnswerSelect(option)}
                disabled={revealFeedback && showAnswer}
                aria-pressed={revealFeedback ? undefined : isSelected}
                aria-keyshortcuts={`${index + 1} ${letter}`}
                className={`w-full text-left px-3 py-2 border-2 rounded-lg ${bgColor} ${motion} ${
                  revealFeedback && showAnswer ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <div className={showsCorrect || showsWrong || isNeutralSelected ? "relative pr-7" : "relative"}>
                  {showsCorrect && (
                    <CheckCircleIcon className="absolute right-0 top-0 h-5 w-5 text-green-600" aria-hidden="true" />
                  )}
                  {showsWrong && (
                    <XCircleIcon className="absolute right-0 top-0 h-5 w-5 text-red-600" aria-hidden="true" />
                  )}
                  {isNeutralSelected && (
                    <CheckCircleIcon className="absolute right-0 top-0 h-5 w-5 text-slate-700" aria-hidden="true" />
                  )}
                  <span className="font-medium">{letter}.</span>{" "}
                  <ForeignPhraseText text={option} />
                  {revealFeedback && (
                    <PronunciationHint
                      text={option}
                      speech={optionSpeech}
                      className="mt-1 text-sm text-gray-500 italic"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {revealFeedback && showAnswer && (
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-blue-900">
              Correct Answer: {item.correctAnswer}
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
            className="mt-1 text-sm text-blue-700 italic"
          />
          {item.explanation && (
            <p className="text-sm text-blue-700 mt-1"><ForeignPhraseText text={item.explanation} linkify /></p>
          )}
        </div>
      )}

      {revealFeedback && (
        <div className="px-3 py-2 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">
            Score: {stats.correct} / {stats.total} correct
            {stats.total > 0 && (
              <span className="ml-2">
                ({Math.round((stats.correct / stats.total) * 100)}%)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
