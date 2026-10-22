import { describe, expect, it, vi } from "vitest";
import {
  createQuizRun,
  getQuizOptions,
  isQuizPlayable,
  reduceQuizRun,
  restoreQuizRun,
  summarizeQuizRun,
  toCompletionSnapshot,
  type QuizRunScope,
} from "./quizRun";

const scope: QuizRunScope = {
  kind: "category",
  category: "exams",
  navigationKeywords: ["act", "math"],
  filterKeywords: ["algebra"],
  quizSize: 3,
};

describe("quizRun", () => {
  it("counts only the first answer for each roster item", () => {
    let run = createQuizRun(scope, ["a", "b", "c"], "guest");
    run = reduceQuizRun(run, {
      type: "answer",
      itemId: "b",
      selectedAnswer: "wrong",
      isCorrect: false,
      completedAt: "2026-10-15T00:00:00.000Z",
    });
    const afterDuplicate = reduceQuizRun(run, {
      type: "answer",
      itemId: "b",
      selectedAnswer: "right",
      isCorrect: true,
      completedAt: "2026-10-15T00:00:01.000Z",
    });

    expect(afterDuplicate).toBe(run);
    expect(summarizeQuizRun(run)).toMatchObject({ answered: 1, correct: 0, total: 3, isComplete: false });
  });

  it("completes out of order and produces an immutable snapshot", () => {
    let run = createQuizRun(scope, ["a", "b"], "guest");
    run = reduceQuizRun(run, { type: "answer", itemId: "b", selectedAnswer: "B", isCorrect: false, completedAt: "2026-10-15T00:00:00.000Z" });
    run = reduceQuizRun(run, { type: "answer", itemId: "a", selectedAnswer: "A", isCorrect: true, completedAt: "2026-10-15T00:00:01.000Z" });

    expect(summarizeQuizRun(run)).toEqual({
      answered: 2,
      correct: 1,
      total: 2,
      missedItemIds: ["b"],
      notAnswered: 0,
      percentage: 50,
      isComplete: true,
    });
    expect(toCompletionSnapshot(run)).toEqual({
      runId: run.runId,
      scope,
      completedAt: "2026-10-15T00:00:01.000Z",
      correct: 1,
      total: 2,
      missedItemIds: ["b"],
    });
    expect(Object.isFrozen(toCompletionSnapshot(run))).toBe(true);
    expect(Object.isFrozen(toCompletionSnapshot(run)?.scope)).toBe(true);
    expect(Object.isFrozen(toCompletionSnapshot(run)?.missedItemIds)).toBe(true);
  });

  it("supports perfect, zero-score, and one-item runs", () => {
    for (const isCorrect of [true, false]) {
      let run = createQuizRun(scope, ["a"], "guest");
      run = reduceQuizRun(run, { type: "answer", itemId: "a", selectedAnswer: "answer", isCorrect, completedAt: "2026-10-15T00:00:00.000Z" });
      expect(summarizeQuizRun(run)).toMatchObject({
        correct: isCorrect ? 1 : 0,
        total: 1,
        percentage: isCorrect ? 100 : 0,
        isComplete: true,
      });
    }
  });

  it("rejects empty runs and cannot enter results early", () => {
    const run = createQuizRun(scope, [], "guest");
    expect(summarizeQuizRun(run).isComplete).toBe(false);
    expect(reduceQuizRun(run, { type: "show-summary" })).toBe(run);
    expect(toCompletionSnapshot(run)).toBeNull();
  });

  it("restores only matching schema, identity, scope, and roster", () => {
    let run = createQuizRun(scope, ["a", "b"], "user:user-1");
    run = reduceQuizRun(run, { type: "answer", itemId: "a", selectedAnswer: "A", isCorrect: true, completedAt: "2026-10-15T00:00:00.000Z" });

    expect(restoreQuizRun(run, scope, ["a", "b"], "user:user-1")).toEqual(run);
    expect(restoreQuizRun(run, scope, ["b", "a"], "user:user-1")).toBeNull();
    expect(restoreQuizRun(run, { ...scope, quizSize: 10 }, ["a", "b"], "user:user-1")).toBeNull();
    expect(restoreQuizRun(run, scope, ["a", "b"], "guest")).toBeNull();
    expect(restoreQuizRun({ stats: { total: 1, correct: 1 } }, scope, ["a", "b"], "user:user-1")).toBeNull();
    expect(restoreQuizRun({ ...run, outcomes: { ...run.outcomes, stale: { itemId: "stale", selectedAnswer: "x", isCorrect: true } } }, scope, ["a", "b"], "user:user-1")).toBeNull();
    expect(restoreQuizRun({ ...run, completionEmitted: true }, scope, ["a", "b"], "user:user-1")).toBeNull();
  });

  it("keeps option order stable within a run and changes it for replay", () => {
    const item = {
      id: "a",
      correctAnswer: "4",
      incorrectAnswers: ["1", "2", "3"],
    } as Parameters<typeof getQuizOptions>[0];
    expect(getQuizOptions(item, "run-1")).toEqual(getQuizOptions(item, "run-1"));
    expect(getQuizOptions(item, "run-1")).not.toEqual(getQuizOptions(item, "run-2"));
  });

  it("shares one filter between isQuizPlayable and getQuizOptions", () => {
    // AC 3.6.17
    const base = { id: "a", correctAnswer: "Paris" } as Parameters<typeof getQuizOptions>[0];
    const cases: string[][] = [
      [],
      ["", "   "],
      ["paris", " PARIS "],
      ["Lyon"],
      ["Lyon", "lyon", " ", "Paris", "Nice"],
    ];
    for (const incorrectAnswers of cases) {
      const item = { ...base, incorrectAnswers };
      const options = getQuizOptions(item, "run-1");
      expect(isQuizPlayable(item)).toBe(options.length > 1);
      expect(options).toContain("Paris");
      expect(options.filter((o) => o.trim() === "")).toHaveLength(0);
    }
    const mixed = { ...base, incorrectAnswers: ["Lyon", "lyon", " ", "Paris", "Nice"] };
    expect([...getQuizOptions(mixed, "run-1")].sort()).toEqual(["Lyon", "Nice", "Paris"]);
  });

  it("locks rapid duplicate submissions", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "run-fixed" });
    const run = createQuizRun(scope, ["a"], "guest");
    const first = reduceQuizRun(run, { type: "answer", itemId: "a", selectedAnswer: "wrong", isCorrect: false, completedAt: "2026-10-15T00:00:00.000Z" });
    const second = reduceQuizRun(first, { type: "answer", itemId: "a", selectedAnswer: "right", isCorrect: true, completedAt: "2026-10-15T00:00:01.000Z" });
    expect(second.outcomes.a.selectedAnswer).toBe("wrong");
    vi.unstubAllGlobals();
  });

  describe("typed answers and schema v3 (AC 3.6.12, 3.6.19)", () => {
    const answeredRun = (inputMode?: "choice" | "typed") =>
      reduceQuizRun(createQuizRun(scope, ["a", "b"], "guest"), {
        type: "answer",
        itemId: "a",
        selectedAnswer: "Paris",
        isCorrect: true,
        completedAt: "2026-10-15T00:00:00.000Z",
        ...(inputMode ? { inputMode } : {}),
      });

    it("records inputMode on the outcome, defaulting to choice", () => {
      expect(answeredRun().outcomes.a.inputMode).toBe("choice");
      expect(answeredRun("typed").outcomes.a.inputMode).toBe("typed");
      expect(createQuizRun(scope, ["a"], "guest").schemaVersion).toBe(3);
    });

    it("restores a typed answer", () => {
      const run = answeredRun("typed");
      expect(restoreQuizRun(run, scope, ["a", "b"], "guest")).toEqual(run);
    });

    it("restores a v2 snapshot (no inputMode) as multiple choice", () => {
      const run = answeredRun();
      const v2 = JSON.parse(JSON.stringify(run));
      v2.schemaVersion = 2;
      delete v2.outcomes.a.inputMode;
      const restored = restoreQuizRun(v2, scope, ["a", "b"], "guest");
      expect(restored?.schemaVersion).toBe(3);
      expect(restored?.outcomes.a.inputMode).toBe("choice");
    });

    it("rejects v1, unknown versions, and a missing or bad inputMode in v3", () => {
      const run = answeredRun();
      expect(restoreQuizRun({ ...run, schemaVersion: 1 }, scope, ["a", "b"], "guest")).toBeNull();
      expect(restoreQuizRun({ ...run, schemaVersion: 4 }, scope, ["a", "b"], "guest")).toBeNull();
      const withMode = (inputMode: unknown) => ({
        ...run,
        outcomes: { a: { ...run.outcomes.a, inputMode } },
      });
      expect(restoreQuizRun(withMode("voice"), scope, ["a", "b"], "guest")).toBeNull();
      expect(restoreQuizRun(withMode(undefined), scope, ["a", "b"], "guest")).toBeNull();
      expect(restoreQuizRun(withMode(1), scope, ["a", "b"], "guest")).toBeNull();
    });

    it("rejects typed answers in a Test snapshot", () => {
      let test = createQuizRun(scope, ["a"], "guest", "test");
      test = reduceQuizRun(test, { type: "start-test", startedAt: "2026-10-15T00:00:00.000Z", timeLimitSec: null });
      test = reduceQuizRun(test, {
        type: "answer",
        itemId: "a",
        selectedAnswer: "x",
        isCorrect: false,
        completedAt: "2026-10-15T00:00:05.000Z",
        inputMode: "typed",
      });
      expect(restoreQuizRun(test, scope, ["a"], "guest", "test")).toBeNull();
    });
  });
});
