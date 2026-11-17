import { describe, expect, it } from "vitest";
import { pickNextRound } from "./nextRoundPick";

const item = (id: string) => ({ id });
const pool = ["a", "b", "c", "d", "e", "f", "g"].map(item);

describe("pickNextRound (#711 Next 5 prefers unseen items)", () => {
  it("draws only unseen, unplayed items when enough exist", () => {
    const picked = pickNextRound(pool, new Set(["a"]), new Set(["b"]), 5);
    expect(picked.map((x) => x.id)).toEqual(["c", "d", "e", "f", "g"]);
  });

  it("never repeats the items the run just played", () => {
    const picked = pickNextRound(pool, new Set(["a", "b", "c", "d", "e"]), new Set(), 5);
    expect(picked.map((x) => x.id)).toEqual(["f", "g"]);
  });

  it("returns nothing when every unplayed item is known (exhausted)", () => {
    expect(pickNextRound(pool, new Set(), new Set(pool.map((x) => x.id)), 5)).toEqual([]);
  });

  it("fills with known items after the unseen ones when unseen run short", () => {
    const picked = pickNextRound(pool, new Set(["c", "d", "e", "f"]), new Set(["a", "b"]), 5);
    expect(picked.map((x) => x.id)).toEqual(["g", "a", "b"]);
  });
});
