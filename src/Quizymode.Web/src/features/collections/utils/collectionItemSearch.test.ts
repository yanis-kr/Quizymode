import { describe, expect, it } from "vitest";
import type { ItemResponse } from "@/types/api";
import { filterCollectionItems } from "./collectionItemSearch";

const base: Partial<ItemResponse> = {
  category: "tech",
  isPrivate: false,
  createdAt: "2026-01-01T00:00:00Z",
  keywords: [],
  collections: [],
};

const items: ItemResponse[] = [
  { ...base, id: "1", question: "What is Mitochondria?", correctAnswer: "Powerhouse", incorrectAnswers: ["Nucleus"], explanation: "Energy" } as ItemResponse,
  { ...base, id: "2", question: "Capital of France", correctAnswer: "Paris", incorrectAnswers: ["Lyon", "Marseille"], explanation: "Seat of government" } as ItemResponse,
  { ...base, id: "3", question: "Pick the odd one", correctAnswer: "Cat", incorrectAnswers: ["Dog", "Ferrari"], explanation: "Cats are not vehicles" } as ItemResponse,
];

describe("filterCollectionItems (#555, AC 1.5.12)", () => {
  it("returns every item for a blank or whitespace-only term", () => {
    expect(filterCollectionItems(items, "")).toHaveLength(3);
    expect(filterCollectionItems(items, "   ")).toHaveLength(3);
  });

  it("matches the question case-insensitively", () => {
    expect(filterCollectionItems(items, "mitochondria").map((i) => i.id)).toEqual(["1"]);
  });

  it("matches the correct answer", () => {
    expect(filterCollectionItems(items, "PARIS").map((i) => i.id)).toEqual(["2"]);
  });

  it("matches an incorrect answer", () => {
    expect(filterCollectionItems(items, "marseille").map((i) => i.id)).toEqual(["2"]);
  });

  it("matches the explanation", () => {
    expect(filterCollectionItems(items, "government").map((i) => i.id)).toEqual(["2"]);
  });

  it("trims surrounding whitespace from the term", () => {
    expect(filterCollectionItems(items, "  energy  ").map((i) => i.id)).toEqual(["1"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterCollectionItems(items, "zebra")).toEqual([]);
  });
});
