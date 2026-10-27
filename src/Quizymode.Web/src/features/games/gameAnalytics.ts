import { trackEventOnce } from "@/features/analytics/analyticsEvents";
import { withContextId, type StudyEventContext } from "@/features/items/quiz/quizAnalytics";
import { gameContextId, type GameScope } from "./gameScope";

/** Games report under context type "game"; an id outside the API's pattern falls back to the game id alone. */
export function gameEventContext(gameId: string, scope: GameScope): StudyEventContext {
  const full: StudyEventContext = withContextId("game", gameContextId(gameId, scope));
  return full.contextId ? full : withContextId("game", gameId);
}

const MAX_TOTAL = 500;

/** The API rejects the whole batch for totals outside 1-500 or scores outside 0-total, so clamp whole numbers. */
function clampTotal(total: number): number {
  return Math.min(Math.max(Math.trunc(Number.isFinite(total) ? total : 1), 1), MAX_TOTAL);
}

function clampScore(score: number, total: number): number {
  return Math.min(Math.max(Math.trunc(Number.isFinite(score) ? score : 0), 0), total);
}

/** One `game_started` per run, at the first move. Total is the game's size (AC 5.4.13). */
export function trackGameStarted(gameId: string, scope: GameScope, runId: string, total: number): void {
  const safeTotal: number = clampTotal(total);
  trackEventOnce(`${gameId}:${runId}:start`, {
    name: "game_started",
    runId,
    total: safeTotal,
    ...gameEventContext(gameId, scope),
  });
}

/** One `game_completed` per run. Score and total follow AC 5.4.13; no time, streak or item data is sent. */
export function trackGameCompleted(gameId: string, scope: GameScope, runId: string, score: number, total: number): void {
  const safeTotal: number = clampTotal(total);
  trackEventOnce(`${gameId}:${runId}:done`, {
    name: "game_completed",
    runId,
    score: clampScore(score, safeTotal),
    total: safeTotal,
    ...gameEventContext(gameId, scope),
  });
}
