import {
  flushDeferredAnalyticsEvents,
  trackEventDeferredOnce,
  trackEventOnce,
  type AnalyticsContextType,
} from "@/features/analytics/analyticsEvents";
import { HOME_SAMPLE_COLLECTION_ID } from "@/features/home/homePageData";
import type { QuizCompletionSnapshot, QuizRunScope, QuizRunState } from "./quizRun";

/** Must match the API's context id rule (AC 5.4.2). Ids that do not fit are left out. */
const CONTEXT_ID_PATTERN = /^[A-Za-z0-9._:/-]{1,128}$/;

export interface StudyEventContext {
  contextType: AnalyticsContextType;
  contextId?: string;
}

/**
 * Where a quiz run came from, for the conversion funnel. The home page's quick quiz is the sample
 * collection, so it is reported as "home" to separate it from other collection quizzes.
 */
export function quizEventContext(scope: QuizRunScope): StudyEventContext {
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

/** Scope of a Flashcards run: the collection or category being studied, otherwise the whole bank. */
export function flashcardsEventContext(collectionId?: string, category?: string): StudyEventContext {
  if (collectionId) {
    return withContextId("collection", collectionId);
  }

  return category ? withContextId("category", category) : { contextType: "flashcards" };
}

export function withContextId(contextType: AnalyticsContextType, contextId: string): StudyEventContext {
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

/**
 * One `question_answered` per item per run, for the first (scored) answer only (AC 5.5.2). Answers are
 * held and sent in small batches; the completion event and page hide flush them.
 */
export function trackQuestionAnswered(run: QuizRunState, itemId: string, isCorrect: boolean): void {
  const position = run.itemIds.indexOf(itemId) + 1;
  if (position < 1) {
    return;
  }

  trackEventDeferredOnce(`${run.runId}:${itemId}`, {
    name: "question_answered",
    runId: run.runId,
    itemId,
    position,
    isCorrect,
    ...quizEventContext(run.scope),
  });
}

/** One `quiz_completed` per run, sent alongside the in-app completion notice after any held answers. */
export function trackQuizRunCompleted(snapshot: QuizCompletionSnapshot): void {
  flushDeferredAnalyticsEvents();
  trackEventOnce(snapshot.runId, {
    name: "quiz_completed",
    runId: snapshot.runId,
    score: snapshot.correct,
    total: snapshot.total,
    ...quizEventContext(snapshot.scope),
  });
}

/** One `quiz_result_shared` per run, after a native share resolves or a copy succeeds (AC 5.5.17). */
export function trackQuizResultShared(runId: string, score: number, total: number, context: StudyEventContext): void {
  trackEventOnce(runId, { name: "quiz_result_shared", runId, score, total, ...context });
}

/** One `flashcards_started` per Flashcards run. */
export function trackFlashcardsStarted(runId: string, total: number, context: StudyEventContext): void {
  trackEventOnce(runId, { name: "flashcards_started", runId, total, ...context });
}

/** One `flashcard_graded` per card per run, for the first grade only (isCorrect = "Got it"). */
export function trackFlashcardGraded(
  runId: string,
  itemId: string,
  position: number,
  isCorrect: boolean,
  context: StudyEventContext,
): void {
  trackEventDeferredOnce(`${runId}:${itemId}:graded`, {
    name: "flashcard_graded",
    runId,
    itemId,
    position,
    isCorrect,
    ...context,
  });
}

/** One `flashcard_revealed` per card per run, the first time its answer is shown. */
export function trackFlashcardRevealed(runId: string, itemId: string, position: number, context: StudyEventContext): void {
  trackEventDeferredOnce(`${runId}:${itemId}`, {
    name: "flashcard_revealed",
    runId,
    itemId,
    position,
    ...context,
  });
}
