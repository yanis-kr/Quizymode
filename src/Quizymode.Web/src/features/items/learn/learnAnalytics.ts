import { trackEventDeferredOnce, trackEventOnce, flushDeferredAnalyticsEvents } from "@/features/analytics/analyticsEvents";
import { withContextId, type StudyEventContext } from "@/features/items/quiz/quizAnalytics";
import type { QuizCompletionSnapshot, QuizRunScope } from "@/features/items/quiz/quizRun";
import type { LearnRunState } from "./learnRun";

/**
 * Learn reports under context type "learn" (AC 3.17.11). The id is prefixed (collection:GUID or category:NAME) because
 * one type carries both; ids outside the API's id pattern are left out, and a global scope has no id.
 */
export function learnEventContext(scope: QuizRunScope): StudyEventContext {
  if (scope.kind === "collection") return withContextId("learn", `collection:${scope.collectionId}`);
  if (scope.kind === "category" && scope.category) return withContextId("learn", `category:${scope.category}`);
  return { contextType: "learn" };
}

/** One `quick_quiz_started` per Learn run; restores and remounts reuse the run id, so they do not repeat it. */
export function trackLearnRunStarted(run: LearnRunState): void {
  trackEventOnce(run.runId, {
    name: "quick_quiz_started",
    runId: run.runId,
    total: run.itemIds.length,
    ...learnEventContext(run.scope),
  });
}

/** `question_answered` for an item's first attempt only; position is the roster index + 1. */
export function trackLearnFirstAttempt(run: LearnRunState, itemId: string, isCorrect: boolean): void {
  const position = run.itemIds.indexOf(itemId) + 1;
  if (position < 1) return;
  trackEventDeferredOnce(`${run.runId}:${itemId}`, {
    name: "question_answered",
    runId: run.runId,
    itemId,
    position,
    isCorrect,
    ...learnEventContext(run.scope),
  });
}

/** One `quiz_completed` per Learn run: score = first-try correct, total = roster size. */
export function trackLearnRunCompleted(snapshot: QuizCompletionSnapshot): void {
  flushDeferredAnalyticsEvents();
  trackEventOnce(snapshot.runId, {
    name: "quiz_completed",
    runId: snapshot.runId,
    score: snapshot.correct,
    total: snapshot.total,
    ...learnEventContext(snapshot.scope),
  });
}
