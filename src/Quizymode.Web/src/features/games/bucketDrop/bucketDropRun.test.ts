import { describe, expect, it } from "vitest";
import type { ItemResponse } from "@/types/api";
import {
  createBucketDropRun,
  getFallMs,
  reduceBucketDropRun,
  type BucketDropRunState,
} from "./bucketDropRun";

function makeItem(n: number): ItemResponse {
  return {
    id: `id-${n}`,
    category: "science",
    isPrivate: false,
    question: `Question ${n}?`,
    correctAnswer: `right-${n}`,
    incorrectAnswers: [`wrong-${n}`, `other-${n}`, `third-${n}`],
    explanation: "",
    createdAt: "2026-03-22T00:00:00Z",
    keywords: [],
    collections: [],
  };
}
const items = (count: number): ItemResponse[] => Array.from({ length: count }, (_, i) => makeItem(i + 1));

const correctIndex = (state: BucketDropRunState): number =>
  state.buckets.indexOf(state.items[state.itemId].correctAnswer);
const wrongIndex = (state: BucketDropRunState): number => (correctIndex(state) + 1) % 3;

const pick = (state: BucketDropRunState, index: number) => reduceBucketDropRun(state, { type: "pick", index });
const next = (state: BucketDropRunState) => reduceBucketDropRun(state, { type: "next" });

describe("getFallMs", () => {
  it("starts at 6 s, speeds up 15% every 5 correct and stops at 2 s", () => {
    expect(getFallMs(0)).toBe(6000);
    expect(getFallMs(4)).toBe(6000);
    expect(getFallMs(5)).toBe(5100);
    expect(getFallMs(10)).toBe(4335);
    expect(getFallMs(500)).toBe(2000);
  });
});

describe("bucketDropRun", () => {
  it("offers exactly three buckets: the answer and two distractors", () => {
    const state = createBucketDropRun(items(4), "run-1");
    expect(state.buckets).toHaveLength(3);
    expect(new Set(state.buckets).size).toBe(3);
    expect(state.buckets).toContain(state.items[state.itemId].correctAnswer);
    expect(state.status).toBe("ready");
    expect(state.lives).toBe(3);
  });

  it("is deterministic for a run id", () => {
    expect(createBucketDropRun(items(4), "run-1")).toEqual(createBucketDropRun(items(4), "run-1"));
  });

  it("scores a correct pick without losing a life", () => {
    const start = createBucketDropRun(items(4), "run-1");
    const state = pick(start, correctIndex(start));
    expect(state.status).toBe("feedback");
    expect(state.score).toBe(1);
    expect(state.lives).toBe(3);
    expect(state.lastResult?.isCorrect).toBe(true);
  });

  it("loses a life and records the miss on a wrong pick", () => {
    const start = createBucketDropRun(items(4), "run-1");
    const state = pick(start, wrongIndex(start));
    expect(state.lives).toBe(2);
    expect(state.score).toBe(0);
    expect(state.missedItemIds).toEqual([start.itemId]);
    expect(state.lastResult).toEqual({ pickedIndex: wrongIndex(start), isCorrect: false });
  });

  it("ignores out-of-range picks, picks during feedback and a land on the waiting first card", () => {
    const start = createBucketDropRun(items(4), "run-1");
    expect(pick(start, 3)).toBe(start);
    expect(pick(start, -1)).toBe(start);
    expect(reduceBucketDropRun(start, { type: "land" })).toBe(start);
    const answered = pick(start, correctIndex(start));
    expect(pick(answered, 0)).toBe(answered);
    expect(reduceBucketDropRun(answered, { type: "land" })).toBe(answered);
  });

  it("treats a landing as a lost life with no pick", () => {
    let state = createBucketDropRun(items(4), "run-1");
    state = next(pick(state, correctIndex(state)));
    expect(state.status).toBe("playing");
    state = reduceBucketDropRun(state, { type: "land" });
    expect(state.lives).toBe(2);
    expect(state.lastResult).toEqual({ pickedIndex: null, isCorrect: false });
    expect(state.status).toBe("feedback");
  });

  it("finishes after the third lost life and not before", () => {
    let state = createBucketDropRun(items(4), "run-1");
    state = next(pick(state, wrongIndex(state)));
    state = next(pick(state, wrongIndex(state)));
    expect(state.status).toBe("playing");
    state = pick(state, wrongIndex(state));
    expect(state.lives).toBe(0);
    expect(state.status).toBe("feedback");
    state = next(state);
    expect(state.status).toBe("finished");
    expect(state.answered).toBe(3);
    expect(next(state)).toBe(state);
  });

  it("serves every item once per cycle", () => {
    let state = createBucketDropRun(items(3), "run-1");
    const seen: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      seen.push(state.itemId);
      state = next(pick(state, correctIndex(state)));
    }
    expect(new Set(seen).size).toBe(3);
    expect(state.score).toBe(3);
    expect(state.itemId).not.toBe(seen[2]);
  });
});
