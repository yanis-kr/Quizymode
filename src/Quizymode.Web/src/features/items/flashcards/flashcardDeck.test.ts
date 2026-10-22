import { describe, expect, it } from "vitest";
import { anchorFirst, pileInDeckOrder, seedFlashcardDeck, shuffleWithAnchor, summaryCounts } from "./flashcardDeck";

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

// AC 3.6.18 (#288)
describe("seedFlashcardDeck", () => {
  const card = (id: string, extra: Record<string, unknown> = {}) =>
    ({ id, category: "Science & Nature", isPrivate: false, ...extra }) as unknown as import("@/types/api").ItemResponse;
  const opts = { navigationKeywords: [], filterKeywords: [], maxItems: 3 };

  it("puts the linked card first and removes its duplicate", () => {
    const result = seedFlashcardDeck([card("a"), card("l"), card("b")], card("l"), opts);
    expect(result.map((i) => i.id)).toEqual(["l", "a", "b"]);
  });

  it("caps the deck at maxItems with the linked card kept", () => {
    const result = seedFlashcardDeck([card("a"), card("b"), card("c")], card("l"), opts);
    expect(result.map((i) => i.id)).toEqual(["l", "a", "b"]);
  });

  it("ignores null, private, filtered and out-of-category links", () => {
    const random = [card("a")];
    expect(seedFlashcardDeck(random, null, opts)).toHaveLength(1);
    expect(seedFlashcardDeck(random, card("l", { isPrivate: true }), opts)).toHaveLength(1);
    expect(seedFlashcardDeck(random, card("l"), { ...opts, filterKeywords: ["x"] })).toHaveLength(1);
    expect(
      seedFlashcardDeck(random, card("l"), { ...opts, categorySlug: "history" })
    ).toHaveLength(1);
    expect(
      seedFlashcardDeck(random, card("l"), { ...opts, categorySlug: "science-nature", navigationKeywords: ["n"] })
    ).toHaveLength(1);
  });

  it("matches the category slug case-insensitively with punctuation", () => {
    const result = seedFlashcardDeck([card("a")], card("l"), { ...opts, categorySlug: "Science-Nature" });
    expect(result.map((i) => i.id)).toEqual(["l", "a"]);
  });
});
