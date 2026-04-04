import { describe, expect, it } from "vitest";
import type { ItemResponse } from "@/types/api";
import { filterItems } from "./itemFilters";

function createItem(overrides: Partial<ItemResponse>): ItemResponse {
  return {
    id: "item-1",
    category: "Geography",
    isPrivate: false,
    question: "What is the capital of France?",
    correctAnswer: "Paris",
    incorrectAnswers: ["London", "Berlin", "Rome"],
    explanation: "Paris is the capital city of France.",
    createdAt: "2026-04-03T00:00:00Z",
    createdBy: "user-1",
    keywords: [{ id: "kw-1", name: "Europe", isPrivate: false }],
    collections: [],
    ...overrides,
  };
}

describe("filterItems", () => {
  it("matches search text across question, answer, explanation, category, and keywords", () => {
    const items = [
      createItem({ id: "question-match" }),
      createItem({
        id: "keyword-match",
        question: "Identify this mountain range",
        correctAnswer: "Andes",
        explanation: "South America",
        category: "Landforms",
        keywords: [{ id: "kw-2", name: "Europe", isPrivate: false }],
      }),
      createItem({
        id: "no-match",
        question: "What is 2 + 2?",
        correctAnswer: "4",
        explanation: "Basic arithmetic",
        category: "Mathematics",
        keywords: [{ id: "kw-3", name: "Numbers", isPrivate: false }],
      }),
    ];

    expect(
      filterItems({
        items,
        searchText: "europe",
        ratingRange: {
          min: null,
          max: null,
          includeUnrated: false,
          onlyUnrated: false,
        },
        ratingsMap: new Map(),
        ratingsLoaded: false,
      }).map((item) => item.id)
    ).toEqual(["question-match", "keyword-match"]);
  });

  it("returns only unrated items when onlyUnrated is enabled", () => {
    const items = [
      createItem({ id: "rated-item" }),
      createItem({ id: "unrated-item" }),
      createItem({ id: "zero-star-item" }),
    ];

    const result = filterItems({
      items,
      searchText: "",
      ratingRange: {
        min: null,
        max: null,
        includeUnrated: false,
        onlyUnrated: true,
      },
      ratingsMap: new Map<string, number | null>([
        ["rated-item", 4],
        ["unrated-item", null],
        ["zero-star-item", 0],
      ]),
      ratingsLoaded: true,
    });

    expect(result.map((item) => item.id)).toEqual([
      "unrated-item",
      "zero-star-item",
    ]);
  });

  it("includes unrated items inside a range when includeUnrated is true", () => {
    const items = [
      createItem({ id: "two-stars" }),
      createItem({ id: "five-stars" }),
      createItem({ id: "unrated" }),
    ];

    const result = filterItems({
      items,
      searchText: "",
      ratingRange: {
        min: 2,
        max: 4,
        includeUnrated: true,
        onlyUnrated: false,
      },
      ratingsMap: new Map<string, number | null>([
        ["two-stars", 2],
        ["five-stars", 5],
      ]),
      ratingsLoaded: true,
    });

    expect(result.map((item) => item.id)).toEqual(["two-stars", "unrated"]);
  });

  it("skips rating filtering until ratings are loaded", () => {
    const items = [createItem({ id: "item-1" }), createItem({ id: "item-2" })];

    const result = filterItems({
      items,
      searchText: "",
      ratingRange: {
        min: 4,
        max: 5,
        includeUnrated: false,
        onlyUnrated: false,
      },
      ratingsMap: new Map<string, number | null>([["item-1", 1]]),
      ratingsLoaded: false,
    });

    expect(result.map((item) => item.id)).toEqual(["item-1", "item-2"]);
  });
});
