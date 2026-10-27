import { isQuizPlayable } from "@/features/items/quiz/quizRun";
import type { ItemResponse } from "@/types/api";

/** Tiles show raw item text, so games only take short, quiz-playable items (AC 3.20.2). */
export const GAME_MAX_QUESTION_CHARS = 80;
export const GAME_MAX_ANSWER_CHARS = 25;
/** Fewest eligible items a game needs; below this the scope shows the empty state. */
export const GAME_MIN_ITEMS = 3;
export const MATCH_RACE_PAIRS_MOBILE = 3;
export const MATCH_RACE_PAIRS_DESKTOP = 6;
/** Items requested for category, keyword and global scopes. */
export const GAME_FETCH_SIZE = 200;

const DESKTOP_QUERY = "(min-width: 640px)";

/** Length in code points of the trimmed raw text (markup counts, emoji count once). */
function textLength(text: string): number {
  return Array.from(text.trim()).length;
}

export function isGameEligible(item: ItemResponse): boolean {
  const question: string = item.question ?? "";
  const answer: string = item.correctAnswer ?? "";
  return (
    textLength(question) > 0 &&
    textLength(answer) > 0 &&
    textLength(question) <= GAME_MAX_QUESTION_CHARS &&
    textLength(answer) <= GAME_MAX_ANSWER_CHARS &&
    isQuizPlayable(item)
  );
}

const normalize = (text: string): string => text.trim().toLowerCase();

/** Eligible items without repeated ids, answers or questions (first wins), so every tile on a board is unique. */
export function buildGamePool(items: readonly ItemResponse[]): ItemResponse[] {
  const ids = new Set<string>();
  const answers = new Set<string>();
  const questions = new Set<string>();
  const pool: ItemResponse[] = [];
  for (const item of items) {
    if (!item.id || ids.has(item.id) || !isGameEligible(item)) continue;
    const answerKey: string = normalize(item.correctAnswer);
    const questionKey: string = normalize(item.question);
    if (answers.has(answerKey) || questions.has(questionKey)) continue;
    ids.add(item.id);
    answers.add(answerKey);
    questions.add(questionKey);
    pool.push(item);
  }
  return pool;
}

/** Pairs a new Match Race run aims for: 6 at 640 px and wider, otherwise 3 (also without matchMedia). */
export function getMatchRaceTargetPairs(): number {
  const wide: boolean =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    !!window.matchMedia(DESKTOP_QUERY)?.matches;
  return wide ? MATCH_RACE_PAIRS_DESKTOP : MATCH_RACE_PAIRS_MOBILE;
}
