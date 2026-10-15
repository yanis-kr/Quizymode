import {
  trackEventOnce,
  type AnalyticsContextType,
} from "@/features/analytics/analyticsEvents";
import { HOME_SAMPLE_COLLECTION_ID } from "@/features/home/homePageData";
import type { QuizCompletionSnapshot, QuizRunScope, QuizRunState } from "./quizRun";

/** Must match the API's context id rule (AC 5.4.2). Ids that do not fit are left out. */
const CONTEXT_ID_PATTERN = /^[A-Za-z0-9._:/-]{1,128}$/;

interface QuizEventContext {
  contextType: AnalyticsContextType;
  contextId?: string;
}

/**
 * Where a quiz run came from, for the conversion funnel. The home page's quick quiz is the sample
 * collection, so it is reported as "home" to separate it from other collection quizzes.
 */
export function quizEventContext(scope: QuizRunScope): QuizEventContext {
  if (scope.kind === "collection") {
    return scope.collectionId === HOME_SAMPLE_COLLECTION_ID
      ? { contextType: "home", contextId: scope.collectionId }
      : withContextId("collection", scope.collectionId);
  }

  if (scope.kind === "category" && scope.category) {
    return withContextId("category", scope.category);
  }

  return { contextType: "quiz" };
}

function withContextId(contextType: AnalyticsContextType, contextId: string): QuizEventContext {
  return CONTEXT_ID_PATTERN.test(contextId) ? { contextType, contextId } : { contextType };
}

/** One `quick_quiz_started` per run; restored runs and remounts reuse the run id, so they do not repeat it. */
export function trackQuizRunStarted(run: QuizRunState): void {
  trackEventOnce(run.runId, {
    name: "quick_quiz_started",
    runId: run.runId,
    total: run.itemIds.length,
    ...quizEventContext(run.scope),
  });
}

/** One `quiz_completed` per run, sent alongside the in-app completion notice. */
export function trackQuizRunCompleted(snapshot: QuizCompletionSnapshot): void {
  trackEventOnce(snapshot.runId, {
    name: "quiz_completed",
    runId: snapshot.runId,
    score: snapshot.correct,
    total: snapshot.total,
    ...quizEventContext(snapshot.scope),
  });
}
