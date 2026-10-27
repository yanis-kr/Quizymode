import { describe, expect, it } from "vitest";
import type { ItemResponse } from "@/types/api";
import { createSurvivalRun, reduceSurvivalRun, type SurvivalRunState } from "./survivalRun";

function makeItem(n: number, overrides: Partial<ItemResponse> = {}): ItemResponse {
  return {
    id: `id-${n}`,
    category: "science",
    isPrivate: false,
    question: `Question ${n}?`,
    correctAnswer: `right-${n}`,
    incorrectAnswers: [`wrong-${n}`, `other-${n}`, `third-${n}`, `fourth-${n}`, "x".repeat(40)],
    explanation: "",
    createdAt: "2026-03-22T00:00:00Z",
    keywords: [],
    collections: [],
    ...overrides,
  };
}
const items = (count: number): ItemResponse[] => Array.from({ length: count }, (_, i) => makeItem(i + 1));

const correctOption = (state: SurvivalRunState): string => state.items[state.itemId].correctAnswer;
const wrongOption = (state: SurvivalRunState): string => state.options.find((o) => o !== correctOption(state))!;

function answerAndNext(state: SurvivalRunState, correct: boolean): SurvivalRunState {
  const option = correct ? correctOption(state) : wrongOption(state);
  return reduceSurvivalRun(reduceSurvivalRun(state, { type: "answer", option }), { type: "next" });
}

describe("survivalRun", () => {
  it("offers the correct answer plus up to 3 short distractors", () => {
    const state = createSurvivalRun(items(3), "run-1");
    expect(state.options).toHaveLength(4);
    expect(state.options).toContain(correctOption(state));
    expect(state.options.every((o) => Array.from(o).length <= 25)).toBe(true);
  });

  it("gives 2 options for an item with one short distractor", () => {
    const only = [makeItem(1, { incorrectAnswers: ["only", "y".repeat(26)] })];
    const state = createSurvivalRun(only, "run-1");
    expect(state.options).toHaveLength(2);
    expect(state.options).not.toContain("y".repeat(26));
  });

  it("handles a correct answer", () => {
    const start = createSurvivalRun(items(3), "run-2");
    const answered = reduceSurvivalRun(start, { type: "answer", option: correctOption(start) });
    expect(answered).toMatchObject({
      status: "feedback",
      streak: 1,
      longestStreak: 1,
      correct: 1,
      answered: 1,
      hearts: 3,
      lastAnswer: { option: correctOption(start), isCorrect: true },
    });
    const next = reduceSurvivalRun(answered, { type: "next" });
    expect(next).toMatchObject({ status: "playing", lastAnswer: null, sequence: 2 });
    expect(next.itemId).not.toBe(start.itemId);
  });

  it("handles a wrong answer: heart lost, streak reset, longest kept, miss recorded once", () => {
    let state = createSurvivalRun(items(3), "run-3");
    state = answerAndNext(state, true);
    state = answerAndNext(state, true);
    const missedId = state.itemId;
    const wrong = reduceSurvivalRun(state, { type: "answer", option: wrongOption(state) });
    expect(wrong).toMatchObject({ hearts: 2, streak: 0, longestStreak: 2, correct: 2, answered: 3 });
    expect(wrong.missedItemIds).toEqual([missedId]);
    expect(wrong.lastAnswer?.isCorrect).toBe(false);
  });

  it("ignores answers during feedback and after finishing, and unknown options", () => {
    const start = createSurvivalRun(items(3), "run-4");
    expect(reduceSurvivalRun(start, { type: "answer", option: "not an option" })).toBe(start);
    expect(reduceSurvivalRun(start, { type: "next" })).toBe(start);
    const feedback = reduceSurvivalRun(start, { type: "answer", option: correctOption(start) });
    expect(reduceSurvivalRun(feedback, { type: "answer", option: wrongOption(start) })).toBe(feedback);
  });

  it("finishes after the third wrong answer and next", () => {
    let state = createSurvivalRun(items(3), "run-5");
    state = answerAndNext(state, false);
    state = answerAndNext(state, false);
    expect(state.hearts).toBe(1);
    const third = reduceSurvivalRun(state, { type: "answer", option: wrongOption(state) });
    expect(third).toMatchObject({ hearts: 0, status: "feedback" });
    expect(third.missedItemIds).toHaveLength(3);
    const done = reduceSurvivalRun(third, { type: "next" });
    expect(done.status).toBe("finished");
    expect(reduceSurvivalRun(done, { type: "answer", option: done.options[0] })).toBe(done);
    expect(reduceSurvivalRun(done, { type: "next" })).toBe(done);
  });

  it("counts a repeated miss of the same item once", () => {
    let state = createSurvivalRun(items(3), "run-6");
    const first = state.itemId;
    state = answerAndNext(state, false);
    for (let guard = 0; guard < 6 && state.itemId !== first; guard += 1) state = answerAndNext(state, true);
    expect(state.itemId).toBe(first);
    const again = reduceSurvivalRun(state, { type: "answer", option: wrongOption(state) });
    expect(again.hearts).toBe(1);
    expect(again.missedItemIds.filter((id) => id === first)).toHaveLength(1);
  });

  it("shows every item once before repeating, then reshuffles without back-to-back repeats", () => {
    let state = createSurvivalRun(items(3), "run-7");
    const seen: string[] = [];
    for (let n = 0; n < 9; n += 1) {
      seen.push(state.itemId);
      state = answerAndNext(state, true);
    }
    for (let pass = 0; pass < 3; pass += 1) {
      expect([...seen.slice(pass * 3, pass * 3 + 3)].sort()).toEqual(["id-1", "id-2", "id-3"]);
    }
    seen.forEach((id, index) => {
      if (index > 0) expect(id).not.toBe(seen[index - 1]);
    });
  });

  it("judges correctness by the raw correct answer shown in the options", () => {
    const padded = makeItem(1, { correctAnswer: "  Paris ", incorrectAnswers: ["Rome"] });
    const state = createSurvivalRun([padded, makeItem(2), makeItem(3)], "run-8");
    const withPadded: SurvivalRunState = { ...state, itemId: "id-1", options: ["Rome", "  Paris "] };
    expect(reduceSurvivalRun(withPadded, { type: "answer", option: "  Paris " }).lastAnswer?.isCorrect).toBe(true);
    expect(reduceSurvivalRun(withPadded, { type: "answer", option: "Rome" }).lastAnswer?.isCorrect).toBe(false);
  });

  it("records the ghost timeline from the first answer clock reading", () => {
    let state = createSurvivalRun(items(5), "run-1");
    state = reduceSurvivalRun(state, { type: "answer", option: correctOption(state), nowMs: 10_000 });
    expect(state.startedAtMs).toBe(10_000);
    expect(state.correctMarksMs).toEqual([0]);
    state = reduceSurvivalRun(state, { type: "next" });
    state = reduceSurvivalRun(state, { type: "answer", option: wrongOption(state), nowMs: 12_000 });
    expect(state.correctMarksMs).toEqual([0]);
    state = reduceSurvivalRun(state, { type: "next" });
    state = reduceSurvivalRun(state, { type: "answer", option: correctOption(state), nowMs: 15_500 });
    expect(state.startedAtMs).toBe(10_000);
    expect(state.correctMarksMs).toEqual([0, 5500]);
  });

  it("keeps no marks when answers carry no clock", () => {
    const state = answerAndNext(createSurvivalRun(items(5), "run-1"), true);
    expect(state.startedAtMs).toBeNull();
    expect(state.correctMarksMs).toEqual([]);
  });
});
