import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushAnalyticsEvents,
  resetAnalyticsEventsForTests,
} from "@/features/analytics/analyticsEvents";
import { trackQuestionAnswered, trackQuizRunCompleted, trackQuizRunStarted } from "./quizAnalytics";
import { createQuizRun, type QuizRunState } from "./quizRun";

// Acceptance-level checks for #127 (AC 5.4.9, 5.5.3, 5.5.4): the real emitter and quiz helpers,
// with only the HTTP edge mocked, so batching, dedupe and the page-hide path run together.
const { mockTrackEvents } = vi.hoisted(() => ({ mockTrackEvents: vi.fn() }));

vi.mock("@/api/analytics", () => ({ analyticsApi: { trackEvents: mockTrackEvents } }));
vi.mock("@/utils/pageViewTracking", () => ({
  getPageViewSessionId: () => "session-1",
  isInternalBrowser: () => false,
}));
vi.mock("@/utils/tokenStorage", () => ({ getToken: () => null }));

interface SentEvent {
  name: string;
  runId?: string;
  itemId?: string;
  position?: number;
  isCorrect?: boolean;
  score?: number;
  total?: number;
}

const itemIds = Array.from({ length: 10 }, (_, index) => `00000000-0000-4000-8000-00000000000${index}`);

function newRun(): QuizRunState {
  return createQuizRun({ kind: "collection", collectionId: "collection-1" }, itemIds, "anonymous");
}

function sentViaApi(): SentEvent[] {
  return mockTrackEvents.mock.calls.flatMap(([request]) => request.events as SentEvent[]);
}

function sentViaKeepalive(): SentEvent[] {
  return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.flatMap(
    ([, init]) => JSON.parse(init.body).events as SentEvent[]
  );
}

describe("study run acceptance (#127)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetAnalyticsEventsForTests();
    mockTrackEvents.mockReset();
    mockTrackEvents.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records one start, ten first answers and one completion with the same run id", async () => {
    const run = newRun();
    trackQuizRunStarted(run);
    itemIds.forEach((itemId, index) => {
      trackQuestionAnswered(run, itemId, index % 2 === 0);
      // A changed answer to the same item sends nothing more.
      trackQuestionAnswered(run, itemId, index % 2 !== 0);
    });
    trackQuizRunCompleted({
      runId: run.runId,
      scope: run.scope,
      completedAt: new Date().toISOString(),
      correct: 5,
      total: 10,
      missedItemIds: [],
    });
    await flushAnalyticsEvents();

    const events = sentViaApi();
    expect(events.filter((event) => event.name === "quick_quiz_started")).toHaveLength(1);
    const answers = events.filter((event) => event.name === "question_answered");
    expect(answers).toHaveLength(10);
    expect(answers.map((event) => event.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(answers.map((event) => event.isCorrect)).toEqual(itemIds.map((_, index) => index % 2 === 0));
    expect(events.filter((event) => event.name === "quiz_completed")).toEqual([
      expect.objectContaining({ score: 5, total: 10 }),
    ]);
    expect(new Set(events.map((event) => event.runId))).toEqual(new Set([run.runId]));
    // Ten answers fit in a handful of requests, far below the 120-per-10-minute budget (AC 5.4.4).
    expect(mockTrackEvents.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("delivers four held answers when the page hides mid-run", async () => {
    const run = newRun();
    trackQuizRunStarted(run);
    await flushAnalyticsEvents();
    itemIds.slice(0, 4).forEach((itemId) => trackQuestionAnswered(run, itemId, true));
    expect(sentViaApi().filter((event) => event.name === "question_answered")).toHaveLength(0);

    window.dispatchEvent(new Event("pagehide"));

    const delivered = sentViaKeepalive();
    expect(delivered.map((event) => [event.name, event.position])).toEqual([
      ["question_answered", 1],
      ["question_answered", 2],
      ["question_answered", 3],
      ["question_answered", 4],
    ]);
    expect(delivered.every((event) => event.runId === run.runId)).toBe(true);
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.keepalive).toBe(true);
  });

  it("gives Play again a new run id so its answers are recorded again", async () => {
    const first = newRun();
    const replay = newRun();
    expect(replay.runId).not.toBe(first.runId);

    trackQuizRunStarted(first);
    trackQuestionAnswered(first, itemIds[0], true);
    trackQuizRunStarted(replay);
    trackQuestionAnswered(replay, itemIds[0], false);
    window.dispatchEvent(new Event("pagehide"));
    await flushAnalyticsEvents();

    const all = [...sentViaApi(), ...sentViaKeepalive()];
    expect(all.filter((event) => event.name === "quick_quiz_started").map((event) => event.runId)).toEqual([
      first.runId,
      replay.runId,
    ]);
    expect(
      all.filter((event) => event.name === "question_answered").map((event) => [event.runId, event.isCorrect])
    ).toEqual([
      [first.runId, true],
      [replay.runId, false],
    ]);
  });
});
