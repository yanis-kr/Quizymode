import { describe, expect, it } from "vitest";
import { cycleOrder } from "./deckCycle";

const ids = ["a", "b", "c", "d", "e"];

describe("cycleOrder", () => {
  it("contains every id exactly once and is deterministic", () => {
    const order = cycleOrder(ids, "run", 0, null);
    expect([...order].sort()).toEqual(ids);
    expect(cycleOrder(ids, "run", 0, null)).toEqual(order);
  });

  it("never starts a cycle with the previous last id", () => {
    for (let cycle = 0; cycle < 50; cycle += 1) {
      for (const last of ids) {
        const order = cycleOrder(ids, "run", cycle, last);
        expect(order[0]).not.toBe(last);
        expect([...order].sort()).toEqual(ids);
      }
    }
  });

  it("handles a single-item pool", () => {
    expect(cycleOrder(["only"], "run", 3, "only")).toEqual(["only"]);
  });
});
