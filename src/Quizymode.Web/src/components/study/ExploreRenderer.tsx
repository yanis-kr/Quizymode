/**
 * Renders a single item in Explore mode: question, answer, explanation, metadata.
 */
import type { ItemResponse } from "@/types/api";

export interface ExploreRendererProps {
  item: ItemResponse;
}

export function ExploreRenderer({ item }: ExploreRendererProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Question</h3>
        <p className="text-gray-700">{item.question}</p>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Answer</h3>
        <p className="text-gray-700 font-semibold">{item.correctAnswer}</p>
      </div>

      {item.explanation && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Explanation
          </h3>
          <p className="text-gray-700">{item.explanation}</p>
        </div>
      )}

      <div className="text-sm text-gray-500 space-y-1">
        <div>Category: {item.category}</div>
        {item.source && <div>Source: {item.source}</div>}
      </div>
    </div>
  );
}
