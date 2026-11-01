import { getQuizDistractors } from "@/features/items/quiz/quizRun";
import { seededShuffle } from "@/features/items/learn/learnRun";
import type { ItemResponse } from "@/types/api";

/** Tiles show raw item text, so games only take short items with at least one short distractor (AC 3.20.2). */
export const GAME_MAX_QUESTION_CHARS = 80;
export const GAME_MAX_ANSWER_CHARS = 25;
/** Fewest eligible items a game needs; below this the scope shows the empty state. */
export const GAME_MIN_ITEMS = 3;
export const MATCH_RACE_PAIRS_MOBILE = 3;
export const MATCH_RACE_PAIRS_DESKTOP = 6;
export const SWIPE_BLITZ_ROUND_MS = 60000;
/** How long a missed Swipe Blitz card shows its answer; input is ignored meanwhile. */
export const SWIPE_REVEAL_MS = 1000;
export const SURVIVAL_HEARTS = 3;
export const SURVIVAL_CORRECT_ADVANCE_MS = 600;
export const BUCKET_DROP_LIVES = 3;
/** Fall time of the first Bucket Drop card; it shortens by 15% after every 5 correct answers, down to the floor. */
export const BUCKET_DROP_BASE_FALL_MS = 6000;
export const BUCKET_DROP_MIN_FALL_MS = 2000;
export const BUCKET_DROP_SPEEDUP = 0.85;
export const BUCKET_DROP_SPEEDUP_EVERY = 5;
/** How long Bucket Drop shows the result of a drop before the next card. */
export const BUCKET_DROP_FEEDBACK_MS = 800;
/** Items requested for category, keyword and global scopes. */
export const GAME_FETCH_SIZE = 200;

const DESKTOP_QUERY = "(min-width: 640px)";

/** Length in code points of the trimmed raw text (markup counts, emoji count once). */
function textLength(text: string): number {
  return Array.from(text.trim()).length;
}

/** The quiz distractors (AC 3.6.17) that are short enough to show in a game. */
export function getGameDistractors(item: Pick<ItemResponse, "correctAnswer" | "incorrectAnswers">): string[] {
  return getQuizDistractors(item).filter((distractor) => textLength(distractor) <= GAME_MAX_ANSWER_CHARS);
}

/** The correct answer plus up to 3 short distractors, shuffled from the seed (2-4 options). */
export function getGameOptions(item: Pick<ItemResponse, "correctAnswer" | "incorrectAnswers">, seedText: string): string[] {
  return seededShuffle([item.correctAnswer, ...getGameDistractors(item).slice(0, 3)], seedText);
}

/** Question games show raw item text in tiles, so picture questions (#407) are excluded (AC 3.20.34). */
export function isGameEligible(item: ItemResponse): boolean {
  const question: string = item.question ?? "";
  const answer: string = item.correctAnswer ?? "";
  return (
    !item.questionImage &&
    textLength(question) > 0 &&
    textLength(answer) > 0 &&
    textLength(question) <= GAME_MAX_QUESTION_CHARS &&
    textLength(answer) <= GAME_MAX_ANSWER_CHARS &&
    getGameDistractors(item).length >= 1
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
    // Picture questions are never eligible; the image key only guards identical questions that differ by picture.
    const questionKey: string = `${normalize(item.question)}\u0000${item.questionImage?.key ?? ""}`;
    if (answers.has(answerKey) || questions.has(questionKey)) continue;
    ids.add(item.id);
    answers.add(answerKey);
    questions.add(questionKey);
    pool.push(item);
  }
  return pool;
}

/** Bucket Drop needs a correct answer plus two short distractors for its three buckets. */
export function isBucketDropEligible(item: Pick<ItemResponse, "correctAnswer" | "incorrectAnswers">): boolean {
  return getGameDistractors(item).length >= 2;
}

/** The already-built game pool narrowed to items with at least two usable distractors. */
export function buildBucketDropPool(pool: readonly ItemResponse[]): ItemResponse[] {
  return pool.filter(isBucketDropEligible);
}

/** Pairs a new Match Race run aims for: 6 at 640 px and wider, otherwise 3 (also without matchMedia). */
export function getMatchRaceTargetPairs(): number {
  const wide: boolean =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    !!window.matchMedia(DESKTOP_QUERY)?.matches;
  return wide ? MATCH_RACE_PAIRS_DESKTOP : MATCH_RACE_PAIRS_MOBILE;
}
