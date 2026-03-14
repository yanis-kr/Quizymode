/**
 * Renders a single item in Quiz mode: question, answer options, feedback.
 */
import type { ItemResponse } from "@/types/api";

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
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Question</h3>
        <p className="text-gray-700">{item.question}</p>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Select an answer:
        </h3>
        <div className="space-y-2">
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
                className={`w-full text-left p-4 border-2 rounded-lg ${bgColor} ${
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
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm font-medium text-blue-900">
            Correct Answer: {item.correctAnswer}
          </p>
          {item.explanation && (
            <p className="text-sm text-blue-700 mt-2">{item.explanation}</p>
          )}
        </div>
      )}

      <div className="text-sm text-gray-500 space-y-1">
        <div>Category: {item.category}</div>
        {item.source && <div>Source: {item.source}</div>}
      </div>

      <div className="p-4 bg-gray-50 rounded-lg">
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
