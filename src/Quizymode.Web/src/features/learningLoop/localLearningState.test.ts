import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import {
  DAILY_STORAGE_KEY,
  INTERESTS_STORAGE_KEY,
  computeStreak,
  readDailyCompletions,
  readLocalInterests,
  recordLocalDailyCompletion,
  writeLocalInterests,
  clearLocalInterests,
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

  it("reads v1 category choices and migrates them on the next save", () => {
    window.localStorage.setItem("quizymode.interests.v1", JSON.stringify({ version: 1, categories: ["history", "languages"] }));
    expect(readLocalInterests()).toEqual(["history", "languages"]);
    expect(writeLocalInterests(["history", "languages/french/core"])).toBe(true);
    expect(readLocalInterests()).toEqual(["history", "languages/french/core"]);
    expect(window.localStorage.getItem("quizymode.interests.v1")).toBeNull();
    clearLocalInterests();
    expect(readLocalInterests()).toEqual([]);
  });

  it("never resurrects a broader v1 pick when v2 is corrupt or deliberately empty", () => {
    window.localStorage.setItem("quizymode.interests.v1", JSON.stringify({ version: 1, categories: ["languages"] }));
    window.localStorage.setItem(INTERESTS_STORAGE_KEY, "{broken");
    expect(readLocalInterests()).toEqual([]);
    window.localStorage.setItem(INTERESTS_STORAGE_KEY, JSON.stringify({ version: 2, categories: [] }));
    expect(readLocalInterests()).toEqual([]);
  });

  it("clearing never restores legacy picks when removing the legacy key fails", () => {
    window.localStorage.setItem("quizymode.interests.v1", JSON.stringify({ version: 1, categories: ["languages"] }));
    const remove = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => { throw new Error("unavailable"); });
    try { clearLocalInterests(); expect(readLocalInterests()).toEqual([]); } finally { remove.mockRestore(); }
  });
});
