import { describe, expect, it } from "vitest";
import type { ItemResponse } from "@/types/api";
import { SWIPE_BLITZ_ROUND_MS } from "../gameRoster";
import {
  createSwipeBlitzRun,
  formatCountdown,
  getRemainingMs,
  reduceSwipeBlitzRun,
  type SwipeBlitzRunState,
  type SwipeChoice,
} from "./swipeBlitzRun";

function makeItem(n: number): ItemResponse {
  return {
    id: `id-${n}`,
    category: "science",
    isPrivate: false,
    question: `Question ${n}?`,
    correctAnswer: `right-${n}`,
    incorrectAnswers: [`wrong-${n}`, `other-${n}`, "x".repeat(40)],
    explanation: "",
    createdAt: "2026-03-22T00:00:00Z",
    keywords: [],
    collections: [],
  };
}
const items = (count: number): ItemResponse[] => Array.from({ length: count }, (_, i) => makeItem(i + 1));
const T0 = 1_000_000;

const rightChoice = (state: SwipeBlitzRunState): SwipeChoice => (state.card.isTrue ? "correct" : "wrong");
const wrongChoice = (state: SwipeBlitzRunState): SwipeChoice => (state.card.isTrue ? "wrong" : "correct");

describe("swipeBlitzRun", () => {
  it("is deterministic per run id", () => {
    const a = createSwipeBlitzRun(items(5), "run-1");
    const b = createSwipeBlitzRun(items(5), "run-1");
    expect(a.card).toEqual(b.card);
    expect(a.order).toEqual(b.order);
  });

  it("splits cards roughly 50/50 between true and false", () => {
    let state = createSwipeBlitzRun(items(5), "run-split");
    let trueCards = 0;
    for (let n = 0; n < 200; n += 1) {
      if (state.card.isTrue) trueCards += 1;
      state = reduceSwipeBlitzRun(state, { type: "decide", choice: rightChoice(state), nowMs: T0 });
    }
    expect(trueCards).toBeGreaterThanOrEqual(70);
    expect(trueCards).toBeLessThanOrEqual(130);
  });

  it("shows the correct answer on a true card and only a short distractor on a false card", () => {
    let state = createSwipeBlitzRun(items(4), "run-cards");
    for (let n = 0; n < 60; n += 1) {
      const item = state.items[state.card.itemId];
      if (state.card.isTrue) expect(state.card.shownAnswer).toBe(item.correctAnswer);
      else {
        expect(state.card.shownAnswer).not.toBe(item.correctAnswer);
        expect(state.card.shownAnswer).toMatch(/^(wrong|other)-/);
      }
      state = reduceSwipeBlitzRun(state, { type: "decide", choice: rightChoice(state), nowMs: T0 });
    }
  });

  it("starts the clock at the first decision and scores right calls", () => {
    const start = createSwipeBlitzRun(items(3), "run-2");
    expect(start.status).toBe("ready");
    expect(getRemainingMs(start, T0)).toBe(SWIPE_BLITZ_ROUND_MS);
    const next = reduceSwipeBlitzRun(start, { type: "decide", choice: rightChoice(start), nowMs: T0 });
    expect(next).toMatchObject({ status: "playing", startedAtMs: T0, score: 1, decisions: 1, reveal: null });
    expect(next.sequence).toBe(2);
    expect(getRemainingMs(next, T0 + 15_000)).toBe(45_000);
  });

  it("reveals a miss, blocks decisions until end-reveal and keeps misses unique", () => {
    const start = createSwipeBlitzRun(items(3), "run-3");
    const missedId = start.card.itemId;
    const missed = reduceSwipeBlitzRun(start, { type: "decide", choice: wrongChoice(start), nowMs: T0 });
    expect(missed.reveal).toEqual({ itemId: missedId });
    expect(missed.missedItemIds).toEqual([missedId]);
    expect(missed.card).toBe(start.card);
    expect(missed).toMatchObject({ score: 0, decisions: 1 });

    expect(reduceSwipeBlitzRun(missed, { type: "decide", choice: rightChoice(missed), nowMs: T0 + 10 })).toBe(missed);

    const after = reduceSwipeBlitzRun(missed, { type: "end-reveal" });
    expect(after.reveal).toBeNull();
    expect(after.card.itemId).not.toBe(missedId);
    expect(reduceSwipeBlitzRun(after, { type: "end-reveal" })).toBe(after);
  });

  it("does not list an item twice when it is missed again after a cycle", () => {
    let state = createSwipeBlitzRun(items(3), "run-4");
    const firstId = state.card.itemId;
    for (let n = 0; n < 8; n += 1) {
      const isFirst = state.card.itemId === firstId;
      const choice = isFirst ? wrongChoice(state) : rightChoice(state);
      state = reduceSwipeBlitzRun(state, { type: "decide", choice, nowMs: T0 });
      state = reduceSwipeBlitzRun(state, { type: "end-reveal" });
    }
    expect(state.missedItemIds.filter((id) => id === firstId)).toHaveLength(1);
  });

  it("does not count a decision at or after the deadline and finishes the round", () => {
    const start = createSwipeBlitzRun(items(3), "run-5");
    const playing = reduceSwipeBlitzRun(start, { type: "decide", choice: rightChoice(start), nowMs: T0 });
    const justBefore = reduceSwipeBlitzRun(playing, {
      type: "decide",
      choice: rightChoice(playing),
      nowMs: T0 + SWIPE_BLITZ_ROUND_MS - 1,
    });
    expect(justBefore.score).toBe(2);
    const late = reduceSwipeBlitzRun(justBefore, {
      type: "decide",
      choice: rightChoice(justBefore),
      nowMs: T0 + SWIPE_BLITZ_ROUND_MS,
    });
    expect(late).toMatchObject({ status: "finished", score: 2, decisions: 2, finishedAtMs: T0 + SWIPE_BLITZ_ROUND_MS });
  });

  it("finishes on time-up, only once the deadline has passed, and ignores everything afterwards", () => {
    const start = createSwipeBlitzRun(items(3), "run-6");
    expect(reduceSwipeBlitzRun(start, { type: "time-up", nowMs: T0 + 999_999 })).toBe(start);
    const playing = reduceSwipeBlitzRun(start, { type: "decide", choice: rightChoice(start), nowMs: T0 });
    expect(reduceSwipeBlitzRun(playing, { type: "time-up", nowMs: T0 + 59_999 })).toBe(playing);
    const done = reduceSwipeBlitzRun(playing, { type: "time-up", nowMs: T0 + 60_500 });
    expect(done).toMatchObject({ status: "finished", finishedAtMs: T0 + SWIPE_BLITZ_ROUND_MS });
    expect(reduceSwipeBlitzRun(done, { type: "decide", choice: "correct", nowMs: T0 + 61_000 })).toBe(done);
    expect(reduceSwipeBlitzRun(done, { type: "end-reveal" })).toBe(done);
  });

  it("ends the round when time runs out during a reveal, clearing the reveal", () => {
    const start = createSwipeBlitzRun(items(3), "run-7");
    const missed = reduceSwipeBlitzRun(start, { type: "decide", choice: wrongChoice(start), nowMs: T0 });
    const done = reduceSwipeBlitzRun(missed, { type: "time-up", nowMs: T0 + SWIPE_BLITZ_ROUND_MS });
    expect(done.status).toBe("finished");
    expect(done.reveal).toBeNull();
    expect(done.missedItemIds).toEqual(missed.missedItemIds);
    expect(reduceSwipeBlitzRun(done, { type: "end-reveal" })).toBe(done);
  });

  it("shows every item once per pass, reshuffles, and never repeats an item back to back", () => {
    let state = createSwipeBlitzRun(items(4), "run-8");
    const seen: string[] = [];
    for (let n = 0; n < 12; n += 1) {
      seen.push(state.card.itemId);
      state = reduceSwipeBlitzRun(state, { type: "decide", choice: rightChoice(state), nowMs: T0 });
    }
    for (let pass = 0; pass < 3; pass += 1) {
      expect([...seen.slice(pass * 4, pass * 4 + 4)].sort()).toEqual(["id-1", "id-2", "id-3", "id-4"]);
    }
    seen.forEach((id, index) => {
      if (index > 0) expect(id).not.toBe(seen[index - 1]);
    });
  });
});

describe("formatCountdown", () => {
  it("rounds up to whole seconds", () => {
    expect(formatCountdown(60_000)).toBe("1:00");
    expect(formatCountdown(42_001)).toBe("0:43");
    expect(formatCountdown(9_000)).toBe("0:09");
    expect(formatCountdown(1)).toBe("0:01");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
