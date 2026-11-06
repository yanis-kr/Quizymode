import { describe, expect, it } from "vitest";
import { createQuizRun, getTestDeadlineMs, reduceQuizRun, restoreQuizRun, summarizeQuizRun, toCompletionSnapshot } from "./quizRun";
const scope = { kind: "collection" as const, collectionId: "collection" };
describe("Required picture timed fairness", () => {
  it("preserves nine seconds of initial loading in the one persisted deadline across restore", () => {
    let run = createQuizRun(scope, ["a"], "owner", "test");
    run = reduceQuizRun(run, { type: "start-test", startedAt: "2026-01-01T00:00:00Z", timeLimitSec: 60 });
    run = reduceQuizRun(run, { type: "picture-pause", paused: true, at: "2026-01-01T00:00:00Z" });
    run = restoreQuizRun(JSON.parse(JSON.stringify(run)), scope, ["a"], "owner", "test")!;
    expect(run.picturePausedAt).toBe("2026-01-01T00:00:00Z");
    run = reduceQuizRun(run, { type: "picture-pause", paused: false, at: "2026-01-01T00:00:09Z" });
    expect(getTestDeadlineMs(run)).toBe(Date.parse("2026-01-01T00:01:09Z"));
    run = reduceQuizRun(run, { type: "answer", itemId: "a", selectedAnswer: "A", isCorrect: true, completedAt: "2026-01-01T00:01:05Z" });
    expect(run.outcomes.a.isCorrect).toBe(true);
    run = reduceQuizRun(run, { type: "picture-pause", paused: false, at: "2026-01-01T00:01:06Z" });
    expect(getTestDeadlineMs(run)).toBe(Date.parse("2026-01-01T00:01:09Z"));
  });
  it("early submit during initial loading excludes the question and emits no completion", () => {
    let run = createQuizRun(scope, ["a"], "guest", "test");
    run = reduceQuizRun(run, { type: "start-test", startedAt: "2026-01-01T00:00:00Z", timeLimitSec: 60 });
    run = reduceQuizRun(run, { type: "picture-pause", paused: true, at: "2026-01-01T00:00:00Z" });
    run = reduceQuizRun(run, { type: "submit", submittedAt: "2026-01-01T00:00:02Z", reason: "manual", unavailableItemIds: ["a"] });
    const result = summarizeQuizRun(run); expect(result.scoredTotal).toBe(0); expect(result.missedItemIds).toEqual([]); expect(toCompletionSnapshot(run)).toBeNull();
  });
});
