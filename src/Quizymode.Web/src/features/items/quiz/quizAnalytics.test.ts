import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_SAMPLE_COLLECTION_ID } from "@/features/home/homePageData";
import { quizEventContext, trackQuizRunCompleted, trackQuizRunStarted } from "./quizAnalytics";
import { createQuizRun, type QuizCompletionSnapshot } from "./quizRun";

const { mockTrackEventOnce } = vi.hoisted(() => ({ mockTrackEventOnce: vi.fn() }));

vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEventOnce: mockTrackEventOnce,
}));

describe("quizAnalytics", () => {
  beforeEach(() => {
    mockTrackEventOnce.mockReset();
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
    expect(mockTrackEventOnce).toHaveBeenNthCalledWith(2, run.runId, {
      name: "quiz_completed",
      runId: run.runId,
      score: 2,
      total: 3,
      contextType: "home",
      contextId: HOME_SAMPLE_COLLECTION_ID,
    });
  });
});
