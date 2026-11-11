import type { ItemResponse } from "@/types/api";

/**
 * Case-insensitive substring match over the visible text of a collection item:
 * question, correct answer, incorrect answers and explanation (#555, AC 1.5.12).
 * A blank or whitespace-only term matches every item.
 */
export function filterCollectionItems(items: ItemResponse[], term: string): ItemResponse[] {
  const needle = term.trim().toLowerCase();
  if (needle === "") return items;
  return items.filter((item) => {
    const haystacks = [
      item.question,
      item.correctAnswer,
      ...(item.incorrectAnswers ?? []),
      item.explanation,
    ];
    return haystacks.some((text) => (text ?? "").toLowerCase().includes(needle));
  });
}
