import { trackEventOnce } from "@/features/analytics/analyticsEvents";
import { withContextId, type StudyEventContext } from "@/features/items/quiz/quizAnalytics";
import { gameContextId, type GameScope } from "./gameScope";

/** Games report under context type "game"; an id outside the API's pattern falls back to the game id alone. */
export function gameEventContext(gameId: string, scope: GameScope): StudyEventContext {
  const full: StudyEventContext = withContextId("game", gameContextId(gameId, scope));
  return full.contextId ? full : withContextId("game", gameId);
}

/** One `game_started` per run, at the first tile selection. Total is the pair count. */
export function trackGameStarted(gameId: string, scope: GameScope, runId: string, total: number): void {
  trackEventOnce(`${gameId}:${runId}:start`, {
    name: "game_started",
    runId,
    total,
    ...gameEventContext(gameId, scope),
  });
}

/** One `game_completed` per run. Score is pairs matched without a miss; no time is sent. */
export function trackGameCompleted(gameId: string, scope: GameScope, runId: string, score: number, total: number): void {
  trackEventOnce(`${gameId}:${runId}:done`, {
    name: "game_completed",
    runId,
    score,
    total,
    ...gameEventContext(gameId, scope),
  });
}
