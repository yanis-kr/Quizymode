/**
 * Client-side mirror of the server's distinct-incorrect-answers rule (#276).
 * Normalization: trim, skip blanks, case-insensitive. The server is authoritative (it compares with
 * OrdinalIgnoreCase and does not strip U+FEFF), so rare Unicode edge cases may differ.
 */
export const INCORRECT_MATCHES_CORRECT_MESSAGE =
  "Incorrect answers must be different from the correct answer.";
export const DUPLICATE_INCORRECT_ANSWERS_MESSAGE =
  "Incorrect answers must be different from each other.";

const toAnswerKey = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

/** Returns the first conflict message (matches-correct before duplicates), or null when the list is fine. */
export function getIncorrectAnswerConflict(
  correctAnswer: string | null | undefined,
  incorrectAnswers: ReadonlyArray<string | null | undefined> | null | undefined
): string | null {
  if (!incorrectAnswers) return null;
  const correct = toAnswerKey(correctAnswer);
  const seen = new Set<string>();
  let matchesCorrect = false;
  let hasDuplicate = false;
  for (const raw of incorrectAnswers) {
    const key = toAnswerKey(raw);
    if (key.length === 0) continue;
    if (correct.length > 0 && key === correct) matchesCorrect = true;
    if (seen.has(key)) hasDuplicate = true;
    seen.add(key);
  }
  if (matchesCorrect) return INCORRECT_MATCHES_CORRECT_MESSAGE;
  return hasDuplicate ? DUPLICATE_INCORRECT_ANSWERS_MESSAGE : null;
}
