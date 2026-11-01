/**
 * One Learn question: heading (focus target), question text and answer options. Mirrors QuizRenderer's option
 * styling but has no score strip; Learn shows mastery progress and its own feedback line instead.
 */
import type { Ref } from "react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/solid";
import type { ItemResponse } from "@/types/api";
import { SpeakButton } from "@/components/SpeakButton";
import { useSpeech } from "@/hooks/useSpeech";
import { PronunciationHint } from "@/components/items/PronunciationHint";
import { QuestionImage } from "@/components/study/QuestionImage";
import { ForeignPhraseText } from "@/components/ForeignPhraseText";
import { getIndexedSpeech } from "@/utils/itemSpeech";

interface LearnQuestionProps {
  item: ItemResponse;
  options: string[];
  selectedAnswer: string | null;
  showAnswer: boolean;
  onAnswerSelect: (answer: string) => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

export function LearnQuestion({ item, options, selectedAnswer, showAnswer, onAnswerSelect, headingRef }: LearnQuestionProps) {
  const { isSupported } = useSpeech();

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <h3 ref={headingRef} tabIndex={-1} className="text-base font-medium text-gray-900 focus:outline-none">
            Question
          </h3>
          <SpeakButton
            text={item.question}
            speech={item.questionSpeech}
            isSupported={isSupported}
            label="Read question aloud"
          />
        </div>
        <p className="text-gray-700"><ForeignPhraseText text={item.question} /></p>
        <PronunciationHint text={item.question} speech={item.questionSpeech} />
        <QuestionImage key={item.id} image={item.questionImage} className="mt-3" />
      </div>

      <div>
        <p className="mb-1 text-base font-medium text-gray-900">Select an answer:</p>
        <div className="space-y-1.5">
          {options.map((option, index) => {
            const letter = String.fromCharCode(65 + index);
            const isCorrect = option === item.correctAnswer;
            const isSelected = selectedAnswer === option;
            const optionSpeech = isCorrect
              ? item.correctAnswerSpeech
              : getIndexedSpeech(
                  item.incorrectAnswerSpeech,
                  item.incorrectAnswers.findIndex((candidate) => candidate === option),
                );
            let bgColor = "bg-white hover:bg-gray-50";
            const showsCorrect = showAnswer && isCorrect;
            const showsWrong = showAnswer && isSelected && !isCorrect;
            if (showsCorrect) bgColor = "bg-green-100 border-green-500";
            else if (showsWrong) bgColor = "bg-red-100 border-red-500";

            return (
              <button
                key={index}
                type="button"
                onClick={() => onAnswerSelect(option)}
                disabled={showAnswer}
                aria-keyshortcuts={`${index + 1} ${letter}`}
                className={`min-h-[44px] w-full rounded-lg border-2 px-3 py-2 text-left ${bgColor} ${
                  showAnswer ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <div className={showsCorrect || showsWrong ? "relative pr-7" : "relative"}>
                  {showsCorrect && (
                    <CheckCircleIcon className="absolute right-0 top-0 h-5 w-5 text-green-600" aria-hidden="true" />
                  )}
                  {showsWrong && (
                    <XCircleIcon className="absolute right-0 top-0 h-5 w-5 text-red-600" aria-hidden="true" />
                  )}
                  <span className="font-medium">{letter}.</span> <ForeignPhraseText text={option} />
                  <PronunciationHint
                    text={option}
                    speech={optionSpeech}
                    className="mt-1 text-sm italic text-gray-500"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
