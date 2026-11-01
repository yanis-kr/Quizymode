import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GAME_MAX_ANSWER_CHARS,
  GAME_MAX_QUESTION_CHARS,
  buildBucketDropPool,
  buildGamePool,
  getGameDistractors,
  getGameOptions,
  getMatchRaceTargetPairs,
  isBucketDropEligible,
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

  it("needs a distractor of at most 25 code points", () => {
    expect(isGameEligible(makeItem(1, { incorrectAnswers: ["d".repeat(26)] }))).toBe(false);
    expect(isGameEligible(makeItem(1, { incorrectAnswers: ["d".repeat(25)] }))).toBe(true);
    expect(isGameEligible(makeItem(1, { incorrectAnswers: ["d".repeat(26), "short"] }))).toBe(true);
  });
});

describe("getGameDistractors and getGameOptions", () => {
  const item = makeItem(1, {
    correctAnswer: "Paris",
    incorrectAnswers: ["Rome", "rome", "D".repeat(26), "Paris", " Berlin ", "Madrid", "Oslo"],
  });

  it("drops long, duplicate and correct-answer distractors", () => {
    expect(getGameDistractors(item)).toEqual(["Rome", "Berlin", "Madrid", "Oslo"]);
  });

  it("is deterministic, holds 2-4 options with the correct answer and never a long distractor", () => {
    const options = getGameOptions(item, "seed-1");
    expect(getGameOptions(item, "seed-1")).toEqual(options);
    expect(options).toHaveLength(4);
    expect(options).toContain("Paris");
    expect(options.every((option) => Array.from(option).length <= GAME_MAX_ANSWER_CHARS)).toBe(true);
    expect(getGameOptions(makeItem(2, { incorrectAnswers: ["only"] }), "s")).toHaveLength(2);
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

  it("excludes picture questions from the pool (#407, AC 3.20.34)", () => {
    const picture = { key: "curated:flags/fr", altText: "Three vertical bands" };
    const pool = buildGamePool([
      makeItem(1, { question: "Which country uses this flag?", questionImage: picture }),
      makeItem(2, { question: "Which country uses this flag?", questionImage: { ...picture, key: "curated:flags/it" } }),
      makeItem(3),
    ]);
    expect(pool.map((item) => item.id)).toEqual(["id-3"]);
  });
});

describe("isGameEligible with a question picture", () => {
  it("is false whenever a picture is set, even for short text", () => {
    const picture = { key: "curated:flags/fr", altText: "Three vertical bands" };
    expect(isGameEligible(makeItem(1))).toBe(true);
    expect(isGameEligible(makeItem(1, { questionImage: picture }))).toBe(false);
    expect(isGameEligible(makeItem(1, { questionImage: null }))).toBe(true);
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

describe("Bucket Drop eligibility", () => {
  it("needs at least two short distractors", () => {
    expect(isBucketDropEligible(makeItem(1, { incorrectAnswers: ["a"] }))).toBe(false);
    expect(isBucketDropEligible(makeItem(1, { incorrectAnswers: ["a", "b"] }))).toBe(true);
    expect(isBucketDropEligible(makeItem(1, { incorrectAnswers: ["a", "b".repeat(26)] }))).toBe(false);
    expect(isBucketDropEligible(makeItem(1, { incorrectAnswers: ["a", "b".repeat(26), "c"] }))).toBe(true);
  });

  it("narrows the game pool without changing its order", () => {
    const pool = buildGamePool([
      makeItem(1, { incorrectAnswers: ["a", "b"] }),
      makeItem(2, { incorrectAnswers: ["a"] }),
      makeItem(3, { incorrectAnswers: ["a", "b", "c"] }),
    ]);
    expect(buildBucketDropPool(pool).map((item) => item.id)).toEqual(["id-1", "id-3"]);
  });
});
