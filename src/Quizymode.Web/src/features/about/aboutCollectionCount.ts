/** "33 questions", or null when the response has no usable count, so the About card shows no count (#885). */
export function aboutQuestionCountLabel(itemCount: unknown): string | null {
  if (typeof itemCount !== "number" || !Number.isInteger(itemCount) || itemCount < 0) return null;
  return `${itemCount} ${itemCount === 1 ? "question" : "questions"}`;
}
