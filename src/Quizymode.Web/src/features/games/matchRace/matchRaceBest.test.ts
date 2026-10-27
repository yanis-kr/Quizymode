import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import {
  GAME_BEST_STORAGE_KEY,
  readBest,
  readBestForScope,
  resetMatchRaceBestForTests,
  writeBestIfFaster,
} from "./matchRaceBest";

describe("matchRaceBest", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    resetMatchRaceBestForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("counts the first run as a new best and stores it per scope and pair count", () => {
    expect(readBest("global|kw=", 3)).toBeNull();
    expect(writeBestIfFaster("global|kw=", 3, 12000)).toEqual({ best: 12000, isNewBest: true, saved: true });
    expect(readBest("global|kw=", 3)).toBe(12000);
    expect(readBest("global|kw=", 6)).toBeNull();
    expect(readBest("collection:x", 3)).toBeNull();
    expect(Object.keys(JSON.parse(localStorage.getItem(GAME_BEST_STORAGE_KEY)!))).toEqual([
      "match-race|global|kw=|pairs=3",
    ]);
  });

  it("keeps the faster time", () => {
    writeBestIfFaster("s", 3, 10000);
    expect(writeBestIfFaster("s", 3, 9000)).toMatchObject({ best: 9000, isNewBest: true });
    expect(writeBestIfFaster("s", 3, 9500)).toMatchObject({ best: 9000, isNewBest: false });
    expect(readBest("s", 3)).toBe(9000);
  });

  it("reads the best at any pair count for a scope, preferring the given one", () => {
    writeBestIfFaster("s", 6, 30000);
    expect(readBestForScope("s", 3)).toBe(30000);
    writeBestIfFaster("s", 3, 20000);
    expect(readBestForScope("s", 6)).toBe(30000);
  });

  it("never throws on bad JSON, a throwing getter or a throwing setter", () => {
    localStorage.setItem(GAME_BEST_STORAGE_KEY, "{not json");
    expect(readBest("s", 3)).toBeNull();
    expect(writeBestIfFaster("s", 3, 5000).isNewBest).toBe(true);

    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(() => readBest("s", 3)).not.toThrow();
    const result = writeBestIfFaster("t", 3, 7000);
    expect(result).toEqual({ best: 7000, isNewBest: true, saved: false });
    expect(readBest("t", 3)).toBe(7000);
  });

  it("keeps at most 100 entries, dropping the oldest", () => {
    for (let index = 0; index < 105; index += 1) writeBestIfFaster(`scope-${index}`, 3, 1000 + index);
    const stored = JSON.parse(localStorage.getItem(GAME_BEST_STORAGE_KEY)!) as Record<string, number>;
    expect(Object.keys(stored)).toHaveLength(100);
    expect(stored["match-race|scope-0|pairs=3"]).toBeUndefined();
    expect(stored["match-race|scope-104|pairs=3"]).toBe(1104);
  });
});
