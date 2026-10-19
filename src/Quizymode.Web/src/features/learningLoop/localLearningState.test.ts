import { beforeEach, describe, expect, it } from "vitest";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import {
  DAILY_STORAGE_KEY,
  INTERESTS_STORAGE_KEY,
  computeStreak,
  readDailyCompletions,
  readLocalInterests,
  recordLocalDailyCompletion,
  writeLocalInterests,
} from "./localLearningState";

describe("localLearningState", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("keeps the first completion of a day and computes the streak like the API", () => {
    recordLocalDailyCompletion({ date: "2026-10-17", correct: 3, total: 5 });
    recordLocalDailyCompletion({ date: "2026-10-18", correct: 4, total: 5 });
    recordLocalDailyCompletion({ date: "2026-10-18", correct: 0, total: 5 });

    const stored = readDailyCompletions();
    expect(stored.find((entry) => entry.date === "2026-10-18")?.correct).toBe(4);
    expect(computeStreak(stored.map((entry) => entry.date), "2026-10-18")).toBe(2);
    expect(computeStreak(stored.map((entry) => entry.date), "2026-10-19")).toBe(2);
    expect(computeStreak(stored.map((entry) => entry.date), "2026-10-20")).toBe(0);
  });

  it("ignores corrupt, unsupported, or invalid documents and entries", () => {
    window.localStorage.setItem(DAILY_STORAGE_KEY, "{not json");
    expect(readDailyCompletions()).toEqual([]);
    window.localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify({ version: 2, completions: [] }));
    expect(readDailyCompletions()).toEqual([]);
    window.localStorage.setItem(
      DAILY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        completions: [
          { date: "2026-10-18", correct: 6, total: 5 },
          { date: "yesterday", correct: 1, total: 5 },
          { date: "2026-10-17", correct: 2, total: 5 },
        ],
      }),
    );
    expect(readDailyCompletions()).toEqual([{ date: "2026-10-17", correct: 2, total: 5 }]);
  });

  it("stores unique valid interest slugs, at most 10", () => {
    writeLocalInterests(["trivia", "trivia", "Bad Slug", ...Array.from({ length: 12 }, (_, i) => `c${i}`)]);
    const interests = readLocalInterests();
    expect(interests[0]).toBe("trivia");
    expect(interests).toHaveLength(10);
    expect(interests).not.toContain("Bad Slug");

    window.localStorage.setItem(INTERESTS_STORAGE_KEY, JSON.stringify({ version: 1, categories: "trivia" }));
    expect(readLocalInterests()).toEqual([]);
  });
});
