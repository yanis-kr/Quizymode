import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_SAMPLE_COLLECTION_ID } from "@/features/home/homePageData";
import {
  flashcardsEventContext,
  quizEventContext,
  trackFlashcardGraded,
  trackQuizResultShared,
  trackFlashcardRevealed,
  trackFlashcardsStarted,
  trackQuestionAnswered,
  trackQuizRunCompleted,
  trackQuizRunStarted,
} from "./quizAnalytics";
import { createQuizRun, type QuizCompletionSnapshot } from "./quizRun";

const { mockTrackEventOnce, mockTrackEventDeferredOnce, mockFlushDeferredAnalyticsEvents } = vi.hoisted(() => ({
  mockTrackEventOnce: vi.fn(),
  mockTrackEventDeferredOnce: vi.fn(),
  mockFlushDeferredAnalyticsEvents: vi.fn(),
}));

vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: mockTrackEventOnce,
  trackEventDeferredOnce: mockTrackEventDeferredOnce,
  flushDeferredAnalyticsEvents: mockFlushDeferredAnalyticsEvents,
}));

describe("quizAnalytics", () => {
  beforeEach(() => {
    mockTrackEventOnce.mockReset();
    mockTrackEventDeferredOnce.mockReset();
    mockFlushDeferredAnalyticsEvents.mockReset();
  });

  it("reports the home quick quiz separately from other collections", () => {
    expect(quizEventContext({ kind: "collection", collectionId: HOME_SAMPLE_COLLECTION_ID })).toEqual({
      contextType: "home",
      contextId: HOME_SAMPLE_COLLECTION_ID,
    });
    expect(quizEventContext({ kind: "collection", collectionId: "c-1" })).toEqual({
      contextType: "collection",
      contextId: "c-1",
    });
  });

  it("uses the category as context and drops ids the API would reject", () => {
    const scope = { navigationKeywords: [], filterKeywords: [], quizSize: 10 };
    expect(quizEventContext({ kind: "category", category: "science", ...scope })).toEqual({
      contextType: "category",
      contextId: "science",
    });
    expect(quizEventContext({ kind: "category", category: "Pop Culture & TV", ...scope })).toEqual({
      contextType: "category",
    });
    expect(quizEventContext({ kind: "global", category: null, ...scope })).toEqual({ contextType: "quiz" });
  });

  it("scopes Flashcards context to the collection, category, or the whole bank", () => {
    expect(flashcardsEventContext("c-1")).toEqual({ contextType: "collection", contextId: "c-1" });
    expect(flashcardsEventContext(undefined, "science")).toEqual({ contextType: "category", contextId: "science" });
    expect(flashcardsEventContext(undefined, "Pop Culture & TV")).toEqual({ contextType: "category" });
    expect(flashcardsEventContext()).toEqual({ contextType: "flashcards" });
  });

  it("sends one start and one completion keyed by the run id", () => {
    const run = createQuizRun({ kind: "collection", collectionId: HOME_SAMPLE_COLLECTION_ID }, ["a", "b", "c"], "anon");
    trackQuizRunStarted(run);

    const snapshot: QuizCompletionSnapshot = {
      runId: run.runId,
      scope: run.scope,
      completedAt: "2026-10-15T00:00:00Z",
      correct: 2,
      total: 3,
      missedItemIds: ["c"],
    };
    trackQuizRunCompleted(snapshot);

    expect(mockTrackEventOnce).toHaveBeenNthCalledWith(1, run.runId, {
      name: "quick_quiz_started",
      runId: run.runId,
      total: 3,
      contextType: "home",
      contextId: HOME_SAMPLE_COLLECTION_ID,
    });
    expect(mockFlushDeferredAnalyticsEvents).toHaveBeenCalledTimes(1);
    expect(mockTrackEventOnce).toHaveBeenNthCalledWith(2, run.runId, {
      name: "quiz_completed",
      runId: run.runId,
      score: 2,
      total: 3,
      contextType: "home",
      contextId: HOME_SAMPLE_COLLECTION_ID,
    });
  });

  it("defers question_answered keyed by run and item, with the 1-based position", () => {
    const run = createQuizRun({ kind: "collection", collectionId: "c-1" }, ["a", "b", "c"], "anon");
    trackQuestionAnswered(run, "b", true);

    expect(mockTrackEventDeferredOnce).toHaveBeenCalledWith(`${run.runId}:b`, {
      name: "question_answered",
      runId: run.runId,
      itemId: "b",
      position: 2,
      isCorrect: true,
      contextType: "collection",
      contextId: "c-1",
    });
  });

  it("does not report an item that is not part of the run", () => {
    const run = createQuizRun({ kind: "collection", collectionId: "c-1" }, ["a", "b"], "anon");
    trackQuestionAnswered(run, "not-in-run", false);

    expect(mockTrackEventDeferredOnce).not.toHaveBeenCalled();
  });

  it("sends one flashcards_started per run", () => {
    trackFlashcardsStarted("run-1", 5, { contextType: "category", contextId: "science" });

    expect(mockTrackEventOnce).toHaveBeenCalledWith("run-1", {
      name: "flashcards_started",
      runId: "run-1",
      total: 5,
      contextType: "category",
      contextId: "science",
    });
  });

  it("defers flashcard_revealed keyed by run and item", () => {
    trackFlashcardRevealed("run-1", "item-1", 3, { contextType: "flashcards" });

    expect(mockTrackEventDeferredOnce).toHaveBeenCalledWith("run-1:item-1", {
      name: "flashcard_revealed",
      runId: "run-1",
      itemId: "item-1",
      position: 3,
      contextType: "flashcards",
    });
  });

  it("defers flashcard_graded keyed by run and item, separately from the reveal", () => {
    trackFlashcardGraded("run-1", "item-1", 3, false, { contextType: "collection", contextId: "c-1" });

    expect(mockTrackEventDeferredOnce).toHaveBeenCalledWith("run-1:item-1:graded", {
      name: "flashcard_graded",
      runId: "run-1",
      itemId: "item-1",
      position: 3,
      isCorrect: false,
      contextType: "collection",
      contextId: "c-1",
    });
  });

  it("sends quiz_result_shared once per run with the run's own context", () => {
    trackQuizResultShared("run-1", 4, 5, { contextType: "daily", contextId: "2026-10-20" });

    expect(mockTrackEventOnce).toHaveBeenCalledWith("run-1", {
      name: "quiz_result_shared",
      runId: "run-1",
      score: 4,
      total: 5,
      contextType: "daily",
      contextId: "2026-10-20",
    });
  });
});
