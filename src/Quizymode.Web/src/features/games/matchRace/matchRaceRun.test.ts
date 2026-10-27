import { describe, expect, it } from "vitest";
import {
  createMatchRaceRun,
  formatGameTime,
  getElapsedMs,
  getFirstTryScore,
  reduceMatchRaceRun,
  type MatchRaceRunState,
  type MatchRaceTileKind,
} from "./matchRaceRun";

const POOL = ["a", "b", "c", "d", "e"];

function select(state: MatchRaceRunState, kind: MatchRaceTileKind, itemId: string, nowMs: number): MatchRaceRunState {
  return reduceMatchRaceRun(state, { type: "select", kind, itemId, nowMs });
}

function threePairs(): MatchRaceRunState {
  return createMatchRaceRun(POOL, 3, "run-1");
}

describe("createMatchRaceRun", () => {
  it("is deterministic per run id and picks the pair count", () => {
    const first = createMatchRaceRun(POOL, 3, "run-1");
    expect(createMatchRaceRun(POOL, 3, "run-1")).toEqual(first);
    expect(first.itemIds).toHaveLength(3);
    expect([...first.questionOrder].sort()).toEqual([...first.itemIds].sort());
    expect([...first.answerOrder].sort()).toEqual([...first.itemIds].sort());
    expect(first.status).toBe("ready");
  });

  it("uses a smaller board when the pool is smaller than the target", () => {
    expect(createMatchRaceRun(["a", "b", "c"], 6, "run-1").pairCount).toBe(3);
  });
});

describe("reduceMatchRaceRun", () => {
  it("starts the clock at the first selection", () => {
    const state = threePairs();
    const id = state.itemIds[0];
    const next = select(state, "question", id, 5000);
    expect(next.startedAtMs).toBe(5000);
    expect(next.status).toBe("playing");
    expect(next.selected).toEqual({ kind: "question", itemId: id });
  });

  it("matches a pair in either order", () => {
    const [x, y] = threePairs().itemIds;
    let state = select(threePairs(), "question", x, 0);
    state = select(state, "answer", x, 100);
    expect(state.clearedItemIds).toEqual([x]);
    state = select(state, "answer", y, 200);
    state = select(state, "question", y, 300);
    expect(state.clearedItemIds).toEqual([x, y]);
    expect(state.selected).toBeNull();
  });

  it("adds a 1 second penalty and a wrong pair on a miss", () => {
    const [x, y] = threePairs().itemIds;
    let state = select(threePairs(), "question", x, 0);
    state = select(state, "answer", y, 100);
    expect(state.wrongPair).toEqual({ questionItemId: x, answerItemId: y });
    expect(state.penaltyMs).toBe(1000);
    expect(state.mistakes).toBe(1);
    expect(state.missedItemIds).toEqual([x]);
    expect(state.selected).toBeNull();
    expect(getElapsedMs(state, 500)).toBe(1500);
  });

  it("moves the selection on a same-kind tap and clears it on a re-tap", () => {
    const [x, y] = threePairs().itemIds;
    let state = select(threePairs(), "question", x, 0);
    state = select(state, "question", y, 10);
    expect(state.selected).toEqual({ kind: "question", itemId: y });
    state = select(state, "question", y, 20);
    expect(state.selected).toBeNull();
    expect(state.mistakes).toBe(0);
  });

  it("ends a lingering wrong state on the next tap and on clear-wrong", () => {
    const [x, y] = threePairs().itemIds;
    let state = select(select(threePairs(), "question", x, 0), "answer", y, 10);
    expect(reduceMatchRaceRun(state, { type: "clear-wrong" }).wrongPair).toBeNull();
    state = select(state, "question", y, 20);
    expect(state.wrongPair).toBeNull();
  });

  it("ignores matched tiles", () => {
    const [x] = threePairs().itemIds;
    const matched = select(select(threePairs(), "question", x, 0), "answer", x, 10);
    expect(select(matched, "question", x, 20)).toBe(matched);
  });

  it("finishes at the last match and freezes the elapsed time including penalties", () => {
    const base = threePairs();
    const [x, y, z] = base.itemIds;
    let state = select(select(base, "question", x, 1000), "answer", y, 1100);
    for (const id of [x, y, z]) {
      state = select(select(state, "question", id, 2000), "answer", id, 3000);
    }
    expect(state.status).toBe("finished");
    expect(state.finishedAtMs).toBe(3000);
    expect(getElapsedMs(state, 99999)).toBe(3000 - 1000 + 1000);
    expect(select(state, "question", x, 4000)).toBe(state);
  });

  it("scores pairs matched without a miss on their question", () => {
    const [x, y] = threePairs().itemIds;
    let state = select(select(threePairs(), "question", x, 0), "answer", y, 10);
    state = select(select(state, "question", x, 20), "answer", x, 30);
    expect(getFirstTryScore(state)).toBe(2);
  });
});

describe("formatGameTime", () => {
  it("formats m:ss.t", () => {
    expect(formatGameTime(0)).toBe("0:00.0");
    expect(formatGameTime(12345)).toBe("0:12.3");
    expect(formatGameTime(61999)).toBe("1:01.9");
    expect(formatGameTime(-5)).toBe("0:00.0");
  });
});
