import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GAME_MAX_ANSWER_CHARS,
  GAME_MAX_QUESTION_CHARS,
  buildGamePool,
  getMatchRaceTargetPairs,
  isGameEligible,
} from "./gameRoster";
import type { ItemResponse } from "@/types/api";

function makeItem(n: number, overrides: Partial<ItemResponse> = {}): ItemResponse {
  return {
    id: `id-${n}`,
    category: "science",
    isPrivate: false,
    question: `Question ${n}?`,
    correctAnswer: `right-${n}`,
    incorrectAnswers: [`wrong-${n}`],
    explanation: "",
    createdAt: "2026-03-22T00:00:00Z",
    keywords: [],
    collections: [],
    ...overrides,
  };
}

describe("isGameEligible", () => {
  it("accepts questions up to 80 and answers up to 25 characters, not beyond", () => {
    expect(isGameEligible(makeItem(1, { question: "q".repeat(GAME_MAX_QUESTION_CHARS) }))).toBe(true);
    expect(isGameEligible(makeItem(1, { question: "q".repeat(GAME_MAX_QUESTION_CHARS + 1) }))).toBe(false);
    expect(isGameEligible(makeItem(1, { correctAnswer: "a".repeat(GAME_MAX_ANSWER_CHARS) }))).toBe(true);
    expect(isGameEligible(makeItem(1, { correctAnswer: "a".repeat(GAME_MAX_ANSWER_CHARS + 1) }))).toBe(false);
  });

  it("measures the trimmed text", () => {
    expect(isGameEligible(makeItem(1, { correctAnswer: `  ${"a".repeat(25)}  ` }))).toBe(true);
    expect(isGameEligible(makeItem(1, { question: "   " }))).toBe(false);
  });

  it("counts emoji as one character each", () => {
    expect(isGameEligible(makeItem(1, { correctAnswer: "😀".repeat(25) }))).toBe(true);
    expect(isGameEligible(makeItem(1, { correctAnswer: "😀".repeat(26) }))).toBe(false);
  });

  it("counts foreign-phrase markup in the raw text", () => {
    expect(isGameEligible(makeItem(1, { correctAnswer: "{{es-ES|hola|hola|OH-la}}" }))).toBe(true);
    expect(isGameEligible(makeItem(1, { correctAnswer: "{{es-ES|buenos dias|buenos dias|BWAY-nos}}" }))).toBe(false);
  });

  it("excludes items that are not quiz-playable", () => {
    expect(isGameEligible(makeItem(1, { incorrectAnswers: [] }))).toBe(false);
  });
});

describe("buildGamePool", () => {
  it("drops repeated ids, answers and questions, keeping the first", () => {
    const pool = buildGamePool([
      makeItem(1, { correctAnswer: "true" }),
      makeItem(1, { question: "Other?" }),
      makeItem(2, { correctAnswer: "True " }),
      makeItem(3, { question: " question 1? " }),
      makeItem(4),
    ]);
    expect(pool.map((item) => item.id)).toEqual(["id-1", "id-4"]);
  });

  it("drops ineligible items", () => {
    const pool = buildGamePool([makeItem(1), makeItem(2, { question: "q".repeat(81) }), makeItem(3, { incorrectAnswers: [] })]);
    expect(pool.map((item) => item.id)).toEqual(["id-1"]);
  });
});

describe("getMatchRaceTargetPairs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is 3 without matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(getMatchRaceTargetPairs()).toBe(3);
  });

  it("is 6 at 640 px and wider, otherwise 3", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(min-width: 640px)" }));
    expect(getMatchRaceTargetPairs()).toBe(6);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(getMatchRaceTargetPairs()).toBe(3);
  });
});
