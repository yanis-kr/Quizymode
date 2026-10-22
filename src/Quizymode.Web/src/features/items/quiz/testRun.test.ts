import { describe, expect, it } from "vitest";
import {
  createQuizRun,
  getTestDeadlineMs,
  reduceQuizRun,
  restoreQuizRun,
  summarizeQuizRun,
  toCompletionSnapshot,
  type QuizRunScope,
  type QuizRunState,
} from "./quizRun";
import { getTestPalette, paletteEntryLabel } from "./test/paletteSelectors";
import { choiceFromLimit, formatDuration, resolveTimeLimit } from "./test/testSetup";
import { toRecordRequest } from "@/features/studySessions/recordStudySession";

const scope: QuizRunScope = { kind: "global", category: null, navigationKeywords: [], filterKeywords: [], quizSize: 4 };
const ids = ["a", "b", "c", "d"];
const START = "2026-10-20T10:00:00.000Z";
const T = (seconds: number): string => new Date(Date.parse(START) + seconds * 1000).toISOString();

function started(limit: number | null = 600, roster: string[] = ids): QuizRunState {
  const run = createQuizRun(scope, roster, "guest", "test");
  return reduceQuizRun(run, { type: "start-test", startedAt: START, timeLimitSec: limit });
}

function answer(run: QuizRunState, itemId: string, isCorrect: boolean, at = 5): QuizRunState {
  return reduceQuizRun(run, {
    type: "answer",
    itemId,
    selectedAnswer: isCorrect ? "right" : "wrong",
    isCorrect,
    completedAt: T(at),
  });
}

describe("Test run reducer (AC 3.18)", () => {
  it("creates Practice runs with empty Test fields and Test runs on the setup card", () => {
    const practice = createQuizRun(scope, ids, "guest");
    expect(practice).toMatchObject({
      schemaVersion: 3,
      mode: "practice",
      flagged: [],
      startedAt: null,
      timeLimitSec: null,
      submittedAt: null,
      submitReason: null,
    });
    expect(createQuizRun(scope, ids, "guest", "test")).toMatchObject({ mode: "test", startedAt: null });
  });

  it("ignores answers, flags and submit before Start, and starts only once", () => {
    const setup = createQuizRun(scope, ids, "guest", "test");
    expect(answer(setup, "a", true)).toBe(setup);
    expect(reduceQuizRun(setup, { type: "toggle-flag", itemId: "a" })).toBe(setup);
    expect(reduceQuizRun(setup, { type: "submit", submittedAt: T(10), reason: "manual" })).toBe(setup);

    const run = reduceQuizRun(setup, { type: "start-test", startedAt: START, timeLimitSec: 120 });
    expect(run).toMatchObject({ startedAt: START, timeLimitSec: 120 });
    expect(reduceQuizRun(run, { type: "start-test", startedAt: T(50), timeLimitSec: null })).toBe(run);
  });

  it("rejects an out-of-range or fractional time limit at Start", () => {
    const setup = createQuizRun(scope, ids, "guest", "test");
    for (const limit of [0, 59, 36001, -1, 90.5, Number.NaN]) {
      expect(reduceQuizRun(setup, { type: "start-test", startedAt: START, timeLimitSec: limit })).toBe(setup);
    }
    expect(reduceQuizRun(setup, { type: "start-test", startedAt: START, timeLimitSec: 60 }).startedAt).toBe(START);
    expect(reduceQuizRun(setup, { type: "start-test", startedAt: START, timeLimitSec: 36000 }).startedAt).toBe(START);
  });

  it("lets the last answer win and never completes on the last answer", () => {
    let run = started();
    run = answer(run, "a", false);
    run = answer(run, "a", true, 6);
    expect(run.outcomes.a).toMatchObject({ selectedAnswer: "right", isCorrect: true });
    for (const id of ids) run = answer(run, id, true, 7);
    expect(run.completedAt).toBeNull();
    expect(summarizeQuizRun(run).isComplete).toBe(false);
    expect(toCompletionSnapshot(run)).toBeNull();
  });

  it("ignores answers at or after the deadline and accepts the last second before it", () => {
    const run = started(60);
    expect(getTestDeadlineMs(run)).toBe(Date.parse(START) + 60000);
    expect(answer(run, "a", true, 60)).toBe(run);
    expect(answer(run, "a", true, 61)).toBe(run);
    expect(answer(run, "a", true, 59).outcomes.a).toBeDefined();
  });

  it("toggles flags in roster order and only before submit", () => {
    let run = started();
    run = reduceQuizRun(run, { type: "toggle-flag", itemId: "c" });
    run = reduceQuizRun(run, { type: "toggle-flag", itemId: "a" });
    expect(run.flagged).toEqual(["a", "c"]);
    run = reduceQuizRun(run, { type: "toggle-flag", itemId: "c" });
    expect(run.flagged).toEqual(["a"]);
    expect(reduceQuizRun(run, { type: "toggle-flag", itemId: "zzz" })).toBe(run);
    const submitted = reduceQuizRun(run, { type: "submit", submittedAt: T(20), reason: "manual" });
    expect(reduceQuizRun(submitted, { type: "toggle-flag", itemId: "b" })).toBe(submitted);
  });

  it("scores unanswered questions as wrong: wrong answers first, then unanswered in roster order", () => {
    let run = started();
    run = answer(run, "c", true);
    run = answer(run, "d", false);
    run = reduceQuizRun(run, { type: "submit", submittedAt: T(30), reason: "manual" });
    expect(run).toMatchObject({ view: "summary", submittedAt: T(30), completedAt: T(30), submitReason: "manual" });
    expect(summarizeQuizRun(run)).toMatchObject({
      correct: 1,
      total: 4,
      answered: 2,
      notAnswered: 2,
      missedItemIds: ["d", "a", "b"],
      percentage: 25,
      isComplete: true,
    });
    expect(toCompletionSnapshot(run)).toMatchObject({
      correct: 1,
      total: 4,
      completedAt: T(30),
      missedItemIds: ["d", "a", "b"],
    });
  });

  it("uses the deadline as the completion time of a late or timed-out submit", () => {
    const run = started(60);
    const late = reduceQuizRun(run, { type: "submit", submittedAt: T(500), reason: "manual" });
    expect(late).toMatchObject({ submittedAt: T(60), completedAt: T(60), submitReason: "timeout" });
    const timeout = reduceQuizRun(run, { type: "submit", submittedAt: T(60), reason: "timeout" });
    expect(timeout.submittedAt).toBe(T(60));
    expect(reduceQuizRun(timeout, { type: "submit", submittedAt: T(61), reason: "manual" })).toBe(timeout);
  });

  it("opens Review all and Review mistakes only after submit", () => {
    const run = started();
    expect(reduceQuizRun(run, { type: "review-all" })).toBe(run);
    expect(reduceQuizRun(run, { type: "show-summary" })).toBe(run);
    const submitted = reduceQuizRun(run, { type: "submit", submittedAt: T(5), reason: "manual" });
    expect(reduceQuizRun(submitted, { type: "review-all" }).view).toBe("review-all");
    expect(reduceQuizRun(submitted, { type: "review-mistakes" }).view).toBe("review");
    let perfect = started();
    for (const id of ids) perfect = answer(perfect, id, true);
    perfect = reduceQuizRun(perfect, { type: "submit", submittedAt: T(9), reason: "manual" });
    expect(reduceQuizRun(perfect, { type: "review-mistakes" })).toBe(perfect);
  });

  it("keeps Practice runs unaffected by Test-only actions", () => {
    const practice = createQuizRun(scope, ids, "guest");
    expect(reduceQuizRun(practice, { type: "start-test", startedAt: START, timeLimitSec: null })).toBe(practice);
    expect(reduceQuizRun(practice, { type: "toggle-flag", itemId: "a" })).toBe(practice);
    expect(reduceQuizRun(practice, { type: "submit", submittedAt: START, reason: "manual" })).toBe(practice);
    expect(reduceQuizRun(practice, { type: "review-all" })).toBe(practice);
  });

  it("sends at most 200 missed ids for a large mostly unanswered test (wrong answers first)", () => {
    const roster = Array.from({ length: 300 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    let run = started(null, roster);
    run = answer(run, roster[5], false);
    run = reduceQuizRun(run, { type: "submit", submittedAt: T(10), reason: "manual" });
    const snapshot = toCompletionSnapshot(run)!;
    expect(snapshot.missedItemIds).toHaveLength(300);
    const request = toRecordRequest(snapshot)!;
    expect(request.total).toBe(300);
    expect(request.correct).toBe(0);
    expect(request.missedItemIds).toHaveLength(200);
    expect(request.missedItemIds[0]).toBe(roster[5]);
    expect(request.missedItemIds[1]).toBe(roster[0]);
  });
});

describe("Test restore validation (AC 3.18.7)", () => {
  const restore = (value: unknown, mode: "practice" | "test" = "test"): QuizRunState | null =>
    restoreQuizRun(value, scope, ids, "guest", mode);

  function submitted(): QuizRunState {
    let run = started(600);
    run = answer(run, "a", true);
    run = reduceQuizRun(run, { type: "toggle-flag", itemId: "b" });
    return reduceQuizRun(run, { type: "submit", submittedAt: T(40), reason: "manual" });
  }

  it("restores setup, in-progress, expired-in-progress and submitted runs", () => {
    const setup = createQuizRun(scope, ids, "guest", "test");
    expect(restore(setup)).toEqual(setup);
    const running = reduceQuizRun(answer(started(600), "a", true), { type: "toggle-flag", itemId: "c" });
    expect(restore(JSON.parse(JSON.stringify(running)))).toEqual(running);
    const expired = started(60);
    expect(restore(expired)).toEqual(expired);
    const done = submitted();
    expect(restore(done)).toEqual(done);
    expect(restore({ ...done, view: "review-all" })?.view).toBe("review-all");
  });

  it("rejects version 1 snapshots and a mode mismatch", () => {
    const run = started();
    expect(restore({ ...run, schemaVersion: 1 })).toBeNull();
    expect(restore(run, "practice")).toBeNull();
    expect(restore(createQuizRun(scope, ids, "guest"), "test")).toBeNull();
  });

  it("rejects invalid flags", () => {
    const run = started();
    expect(restore({ ...run, flagged: ["a", "a"] })).toBeNull();
    expect(restore({ ...run, flagged: ["zzz"] })).toBeNull();
    expect(restore({ ...run, flagged: "a" })).toBeNull();
  });

  it("rejects limits outside 60-36000 seconds", () => {
    for (const timeLimitSec of [59, 36001, 0, -5, 90.5, "600"]) {
      expect(restore({ ...started(), timeLimitSec })).toBeNull();
    }
    expect(restore({ ...started(), timeLimitSec: 60 })).not.toBeNull();
    expect(restore({ ...started(), timeLimitSec: 36000 })).not.toBeNull();
    expect(restore({ ...started(null) })).not.toBeNull();
  });

  it("rejects unparseable or out-of-order timestamps", () => {
    const done = submitted();
    expect(restore({ ...started(), startedAt: "not a date" })).toBeNull();
    expect(restore({ ...done, submittedAt: "nope", completedAt: "nope" })).toBeNull();
    expect(restore({ ...done, submittedAt: T(-10), completedAt: T(-10) })).toBeNull();
    expect(restore({ ...done, completedAt: T(41) })).toBeNull();
    expect(restore({ ...done, submitReason: null })).toBeNull();
  });

  it("rejects a non-active view without a submit time", () => {
    const run = started();
    expect(restore({ ...run, view: "summary" })).toBeNull();
    expect(restore({ ...run, view: "review-all" })).toBeNull();
    expect(restore({ ...run, completionEmitted: true })).toBeNull();
    // Submitted but still marked active.
    expect(restore({ ...submitted(), view: "active" })).toBeNull();
    expect(restore({ ...createQuizRun(scope, ids, "guest", "test"), view: "summary" })).toBeNull();
  });

  it("rejects a setup snapshot that holds answers, and Practice runs carrying Test fields", () => {
    const setup = createQuizRun(scope, ids, "guest", "test");
    expect(restore({ ...setup, outcomes: { a: { itemId: "a", selectedAnswer: "x", isCorrect: true } } })).toBeNull();
    expect(restore({ ...setup, timeLimitSec: 120 })).toBeNull();
    const practice = createQuizRun(scope, ids, "guest");
    expect(restore(practice, "practice")).toEqual(practice);
    for (const extra of [
      { flagged: ["a"] },
      { startedAt: START },
      { timeLimitSec: 120 },
      { submittedAt: START },
      { submitReason: "manual" },
      { view: "review-all" },
    ]) {
      expect(restore({ ...practice, ...extra }, "practice")).toBeNull();
    }
  });
});

describe("Test palette and setup helpers", () => {
  it("lists every question with answered, flagged and current cues and the counts", () => {
    let run = started();
    run = answer(run, "b", true);
    run = reduceQuizRun(run, { type: "toggle-flag", itemId: "b" });
    run = reduceQuizRun(run, { type: "toggle-flag", itemId: "d" });
    const palette = getTestPalette(run, 1);
    expect(palette).toMatchObject({ answered: 1, unanswered: 3, flagged: 2 });
    expect(palette.entries.map(paletteEntryLabel)).toEqual([
      "Question 1, unanswered",
      "Question 2, answered, flagged, current",
      "Question 3, unanswered",
      "Question 4, unanswered, flagged",
    ]);
    expect(palette.entries.every((entry) => entry.result === undefined)).toBe(true);
  });

  it("adds a result per entry after submit", () => {
    let run = started();
    run = answer(run, "a", true);
    run = answer(run, "b", false);
    run = reduceQuizRun(run, { type: "submit", submittedAt: T(9), reason: "manual" });
    expect(getTestPalette(run, 0).entries.map((entry) => entry.result)).toEqual([
      "correct",
      "incorrect",
      "unanswered",
      "unanswered",
    ]);
  });

  it("resolves time limits and caps per-question presets at 600 minutes", () => {
    expect(resolveTimeLimit("none", "", 20)).toEqual({ limitSec: null, error: null, capped: false });
    expect(resolveTimeLimit("per-1", "", 20).limitSec).toBe(1200);
    expect(resolveTimeLimit("per-2", "", 65).limitSec).toBe(7800);
    expect(resolveTimeLimit("per-2", "", 400)).toEqual({ limitSec: 36000, error: null, capped: true });
    expect(resolveTimeLimit("per-1", "", 1).limitSec).toBe(60);
    expect(resolveTimeLimit("custom", "45", 20).limitSec).toBe(2700);
    expect(resolveTimeLimit("custom", "600", 20).limitSec).toBe(36000);
    for (const bad of ["", "0", "601", "-1", "1.5", "abc"]) {
      expect(resolveTimeLimit("custom", bad, 20)).toEqual({
        limitSec: null,
        error: "Enter 1 to 600 minutes.",
        capped: false,
      });
    }
  });

  it("maps a stored limit back to the setup controls and formats durations", () => {
    expect(choiceFromLimit(null, 10).choice).toBe("none");
    expect(choiceFromLimit(600, 10).choice).toBe("per-1");
    expect(choiceFromLimit(1200, 10).choice).toBe("per-2");
    expect(choiceFromLimit(2700, 10)).toEqual({ choice: "custom", customMinutes: "45" });
    expect(formatDuration(754)).toBe("12:34");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(-3)).toBe("0:00");
  });
});
