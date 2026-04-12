/**
 * Renders a single item in Quiz mode: question, answer options, feedback.
 */
import type { ItemResponse } from "@/types/api";
import { TextWithLinks } from "@/components/TextWithLinks";
import { SpeakButton } from "@/components/SpeakButton";
import { useSpeech } from "@/hooks/useSpeech";

export interface QuizRendererProps {
  item: ItemResponse;
  options: string[];
  selectedAnswer: string | null;
  showAnswer: boolean;
  onAnswerSelect: (answer: string) => void;
  stats: { total: number; correct: number };
}

export function QuizRenderer({
  item,
  options,
  selectedAnswer,
  showAnswer,
  onAnswerSelect,
  stats,
}: QuizRendererProps) {
  const { speak, isSupported } = useSpeech();

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <h3 className="text-base font-medium text-gray-900">Question</h3>
          <SpeakButton
            text={item.question}
            onSpeak={speak}
            isSupported={isSupported}
            label="Read question aloud"
          />
        </div>
        <p className="text-gray-700">{item.question}</p>
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
            let bgColor = "bg-white hover:bg-gray-50";
            if (showAnswer) {
              if (isCorrect) {
                bgColor = "bg-green-100 border-green-500";
              } else if (isSelected && !isCorrect) {
                bgColor = "bg-red-100 border-red-500";
              }
            }

            return (
              <button
                key={index}
                type="button"
                onClick={() => onAnswerSelect(option)}
                disabled={showAnswer}
                className={`w-full text-left px-3 py-2 border-2 rounded-lg ${bgColor} ${
                  showAnswer ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <span className="font-medium">{letter}.</span> {option}
              </button>
            );
          })}
        </div>
      </div>

      {showAnswer && (
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-blue-900">
              Correct Answer: {item.correctAnswer}
            </p>
            <SpeakButton
              text={item.correctAnswer}
              onSpeak={speak}
              isSupported={isSupported}
              label="Read answer aloud"
            />
          </div>
          {item.explanation && (
            <p className="text-sm text-blue-700 mt-1"><TextWithLinks text={item.explanation} /></p>
          )}
        </div>
      )}

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
    </div>
  );
}
