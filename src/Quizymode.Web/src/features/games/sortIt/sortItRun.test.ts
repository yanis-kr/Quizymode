import { describe, expect, it } from "vitest";
import type { ItemResponse } from "@/types/api";
import { buildSortItGroups } from "./sortItPool";
import { createSortItRun, reduceSortItRun, type SortItRunState } from "./sortItRun";

function make(id: string, groupLabel: string, answer: string): ItemResponse {
  return {
    id,
    category: "science",
    isPrivate: false,
    question: "Q?",
    correctAnswer: answer,
    incorrectAnswers: [],
    explanation: "",
    createdAt: "2026-03-22T00:00:00Z",
    keywords: [],
    collections: [],
    groupLabel,
  };
}

const labels = ["A", "B", "C", "D", "E"];
const items: ItemResponse[] = labels.flatMap((label) =>
  Array.from({ length: 4 }, (_, i) => make(`${label}${i}`, label, `${label.toLowerCase()}-fact-${i}`)),
);
const groups = buildSortItGroups(items);

const correctIndex = (state: SortItRunState): number => state.items[state.itemId].bucketIndex;
const wrongIndex = (state: SortItRunState): number => (correctIndex(state) + 1) % state.buckets.length;

describe("createSortItRun", () => {
  it("uses at most four groups, only their items, and a stable bucket order", () => {
    const run = createSortItRun(groups, "run-1");
    expect(run.buckets).toHaveLength(4);
    expect(new Set(run.buckets).size).toBe(4);
    expect(run.poolIds).toHaveLength(16);
    expect(run.status).toBe("ready");
    expect(run.lives).toBe(3);
    expect(run.sequence).toBe(1);
    expect(createSortItRun(groups, "run-1").buckets).toEqual(run.buckets);
  });

  it("maps every item to the bucket of its own group", () => {
    const run = createSortItRun(groups, "run-2");
    for (const id of run.poolIds) {
      expect(run.buckets[run.items[id].bucketIndex]).toBe(id[0]);
    }
  });

  it("keeps all groups when there are two", () => {
    const run = createSortItRun(groups.slice(0, 2), "run-3");
    expect(run.buckets).toHaveLength(2);
    expect(run.poolIds).toHaveLength(8);
  });
});

describe("reduceSortItRun", () => {
  it("scores a correct pick and moves to feedback", () => {
    const run = createSortItRun(groups, "run-1");
    const next = reduceSortItRun(run, { type: "pick", index: correctIndex(run) });
    expect(next).toMatchObject({ score: 1, answered: 1, lives: 3, status: "feedback" });
    expect(next.lastResult).toEqual({ pickedIndex: correctIndex(run), isCorrect: true });
  });

  it("costs a life and records the miss once on a wrong pick", () => {
    const run = createSortItRun(groups, "run-1");
    const next = reduceSortItRun(run, { type: "pick", index: wrongIndex(run) });
    expect(next).toMatchObject({ score: 0, lives: 2, status: "feedback", missedItemIds: [run.itemId] });
  });

  it("ignores out-of-range picks and picks during feedback", () => {
    const run = createSortItRun(groups.slice(0, 2), "run-1");
    expect(reduceSortItRun(run, { type: "pick", index: 2 })).toBe(run);
    expect(reduceSortItRun(run, { type: "pick", index: -1 })).toBe(run);
    const feedback = reduceSortItRun(run, { type: "pick", index: 0 });
    expect(reduceSortItRun(feedback, { type: "pick", index: 0 })).toBe(feedback);
  });

  it("lands only while playing and counts it as a miss without a pick", () => {
    const run = createSortItRun(groups, "run-1");
    expect(reduceSortItRun(run, { type: "land" })).toBe(run);
    const playing = reduceSortItRun(reduceSortItRun(run, { type: "pick", index: correctIndex(run) }), { type: "next" });
    expect(playing.status).toBe("playing");
    const landed = reduceSortItRun(playing, { type: "land" });
    expect(landed).toMatchObject({ lives: 2, status: "feedback", lastResult: { pickedIndex: null, isCorrect: false } });
  });

  it("deals the next card, never repeating one until the deck is used, and keeps buckets fixed", () => {
    let state = createSortItRun(groups, "run-1");
    const buckets = state.buckets;
    const seen = new Set<string>();
    for (let i = 0; i < state.poolIds.length; i += 1) {
      seen.add(state.itemId);
      state = reduceSortItRun(reduceSortItRun(state, { type: "pick", index: correctIndex(state) }), { type: "next" });
      expect(state.buckets).toEqual(buckets);
    }
    expect(seen.size).toBe(16);
    expect(state.cycle).toBe(1);
  });

  it("finishes after the third life", () => {
    let state = createSortItRun(groups, "run-1");
    for (let i = 0; i < 3; i += 1) {
      state = reduceSortItRun(state, { type: "pick", index: wrongIndex(state) });
      state = reduceSortItRun(state, { type: "next" });
    }
    expect(state).toMatchObject({ status: "finished", lives: 0, answered: 3, score: 0 });
    expect(reduceSortItRun(state, { type: "pick", index: 0 })).toBe(state);
  });
});
