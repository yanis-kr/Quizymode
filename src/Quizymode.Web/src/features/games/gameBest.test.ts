import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { readBest, writeBestIfFaster } from "./matchRace/matchRaceBest";
import {
  GAME_BEST_STORAGE_KEY,
  readGameBest,
  resetGameBestForTests,
  sortItBestKey,
  survivalBestKey,
  swipeBlitzBestKey,
  writeBestIfHigher,
} from "./gameBest";

describe("gameBest", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    resetGameBestForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("builds per-game keys", () => {
    expect(swipeBlitzBestKey("global|kw=")).toBe("swipe-blitz|global|kw=");
    expect(survivalBestKey("collection:x")).toBe("survival|collection:x");
    expect(sortItBestKey("category:science|nav=|kw=")).toBe("sort-it|category:science|nav=|kw=");
  });

  it("stores the first positive value, replaces with higher, keeps equal and lower", () => {
    const key = swipeBlitzBestKey("s");
    expect(readGameBest(key)).toBeNull();
    expect(writeBestIfHigher(key, 5)).toEqual({ best: 5, isNewBest: true, saved: true });
    expect(writeBestIfHigher(key, 5)).toEqual({ best: 5, isNewBest: false, saved: true });
    expect(writeBestIfHigher(key, 3)).toEqual({ best: 5, isNewBest: false, saved: true });
    expect(writeBestIfHigher(key, 9)).toEqual({ best: 9, isNewBest: true, saved: true });
    expect(readGameBest(key)).toBe(9);
  });

  it("never stores 0 or less and never reports it as a new best", () => {
    const key = survivalBestKey("s");
    expect(writeBestIfHigher(key, 0)).toEqual({ best: 0, isNewBest: false, saved: true });
    expect(writeBestIfHigher(key, -1).isNewBest).toBe(false);
    expect(writeBestIfHigher(key, Number.NaN).isNewBest).toBe(false);
    expect(readGameBest(key)).toBeNull();
    expect(localStorage.getItem(GAME_BEST_STORAGE_KEY)).toBeNull();
  });

  it("caps entries at 100 across games, dropping the oldest and treating a rewrite as newest", () => {
    for (let n = 0; n < 60; n += 1) writeBestIfHigher(swipeBlitzBestKey(`s${n}`), 1);
    for (let n = 0; n < 40; n += 1) writeBestIfHigher(survivalBestKey(`s${n}`), 1);
    writeBestIfHigher(swipeBlitzBestKey("s0"), 2);
    writeBestIfHigher(survivalBestKey("extra"), 1);
    const stored = JSON.parse(localStorage.getItem(GAME_BEST_STORAGE_KEY)!) as Record<string, number>;
    expect(Object.keys(stored)).toHaveLength(100);
    expect(stored[swipeBlitzBestKey("s0")]).toBe(2);
    expect(stored[swipeBlitzBestKey("s1")]).toBeUndefined();
  });

  it("keeps a Match Race lower-is-better best intact under Swipe and Survival writes", () => {
    writeBestIfFaster("s", 3, 12000);
    writeBestIfHigher(swipeBlitzBestKey("s"), 20);
    writeBestIfHigher(survivalBestKey("s"), 7);
    writeBestIfFaster("s", 3, 15000);
    expect(readBest("s", 3)).toBe(12000);
    expect(readGameBest(swipeBlitzBestKey("s"))).toBe(20);
    expect(readGameBest(survivalBestKey("s"))).toBe(7);
  });

  it("never throws when storage holds bad JSON, is unwritable or unreadable, and falls back to memory", () => {
    localStorage.setItem(GAME_BEST_STORAGE_KEY, "{not json");
    expect(readGameBest("x")).toBeNull();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const key = survivalBestKey("mem");
    expect(writeBestIfHigher(key, 4)).toEqual({ best: 4, isNewBest: true, saved: false });
    expect(readGameBest(key)).toBe(4);
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readGameBest(key)).toBe(4);
  });
});
