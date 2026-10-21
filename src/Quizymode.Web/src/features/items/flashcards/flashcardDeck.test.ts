import { describe, expect, it } from "vitest";
import { anchorFirst, pileInDeckOrder, shuffleWithAnchor, summaryCounts } from "./flashcardDeck";

const deck = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("flashcardDeck", () => {
  it("shuffles deterministically and keeps the anchor first", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const first = shuffleWithAnchor(ids, "c", () => 0);
    expect(first[0]).toBe("c");
    expect([...first].sort()).toEqual(ids);
    expect(shuffleWithAnchor(ids, "c", () => 0)).toEqual(first);
    expect(shuffleWithAnchor(ids, "c", () => 0.99)).not.toEqual(first);
  });

  it("ignores an anchor that is not in the deck", () => {
    expect([...shuffleWithAnchor(["a", "b"], "zzz", () => 0)].sort()).toEqual(["a", "b"]);
    expect(shuffleWithAnchor(["a", "b"], null, () => 0)).toHaveLength(2);
  });

  it("moves the anchor to the front without reordering the rest", () => {
    expect(anchorFirst(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(anchorFirst(["a", "b", "c"], null)).toEqual(["a", "b", "c"]);
  });

  it("keeps the still-learning pile in deck order", () => {
    expect(pileInDeckOrder(deck, { d: "still-learning", b: "still-learning", a: "got-it" }).map((i) => i.id)).toEqual(["b", "d"]);
  });

  it("counts per round and ignores grades of cards outside the deck", () => {
    expect(summaryCounts(deck, { a: "got-it", b: "still-learning", zzz: "got-it" })).toEqual({
      gotIt: 1,
      stillLearning: 1,
      notGraded: 2,
    });
  });
});
