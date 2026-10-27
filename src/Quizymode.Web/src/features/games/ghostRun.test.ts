import { beforeEach, describe, expect, it } from "vitest";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import {
  GHOST_STORAGE_KEY,
  MAX_GHOST_MARKS,
  compareMatchRaceToGhost,
  compareSurvivalToGhost,
  describeMatchRaceGhost,
  describeSurvivalGhost,
  ghostProgressAt,
  matchRaceGhostKey,
  readGhost,
  resetGhostForTests,
  survivalGhostKey,
  writeMatchRaceGhostIfBetter,
  writeSurvivalGhostIfBetter,
} from "./ghostRun";

describe("ghostRun", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    resetGhostForTests();
  });

  it("counts the marks at or before a time", () => {
    const marks = [1000, 2500, 2500, 9000];
    expect(ghostProgressAt(marks, 0)).toBe(0);
    expect(ghostProgressAt(marks, 999)).toBe(0);
    expect(ghostProgressAt(marks, 1000)).toBe(1);
    expect(ghostProgressAt(marks, 2500)).toBe(3);
    expect(ghostProgressAt(marks, 100000)).toBe(4);
    expect(ghostProgressAt([], 5)).toBe(0);
  });

  it("builds keys per game, scope and board size", () => {
    expect(matchRaceGhostKey("global|kw=", 6)).toBe("match-race|global|kw=|6");
    expect(survivalGhostKey("global|kw=")).toBe("survival|global|kw=");
  });

  it("stores the first Match Race ghost and replaces it only with a faster final time", () => {
    const key = matchRaceGhostKey("s", 3);
    expect(readGhost(key)).toBeNull();
    expect(writeMatchRaceGhostIfBetter(key, [1000, 2000, 5000])).toBe(true);
    expect(writeMatchRaceGhostIfBetter(key, [1000, 2000, 5000])).toBe(false);
    expect(writeMatchRaceGhostIfBetter(key, [900, 3000, 6000])).toBe(false);
    expect(readGhost(key)).toEqual([1000, 2000, 5000]);
    expect(writeMatchRaceGhostIfBetter(key, [800, 1500, 4000])).toBe(true);
    expect(readGhost(key)).toEqual([800, 1500, 4000]);
  });

  it("replaces a Survival ghost with more correct answers, or the same count reached faster", () => {
    const key = survivalGhostKey("s");
    expect(writeSurvivalGhostIfBetter(key, [0, 3000])).toBe(true);
    expect(writeSurvivalGhostIfBetter(key, [0])).toBe(false);
    expect(writeSurvivalGhostIfBetter(key, [0, 4000])).toBe(false);
    expect(writeSurvivalGhostIfBetter(key, [0, 2000])).toBe(true);
    expect(writeSurvivalGhostIfBetter(key, [0, 2500, 9000])).toBe(true);
    expect(readGhost(key)).toEqual([0, 2500, 9000]);
  });

  it("never stores an empty run", () => {
    expect(writeMatchRaceGhostIfBetter("a", [])).toBe(false);
    expect(writeSurvivalGhostIfBetter("b", [])).toBe(false);
    expect(readGhost("a")).toBeNull();
  });

  it("compares a finished run with its ghost", () => {
    expect(compareMatchRaceToGhost([1000, 8000], 6500)).toBe(1500);
    expect(compareMatchRaceToGhost([1000, 8000], 9000)).toBe(-1000);
    expect(compareSurvivalToGhost([0, 1000, 4000, 9000], 3, 4500)).toBe(0);
    expect(compareSurvivalToGhost([0, 1000, 4000, 9000], 5, 4500)).toBe(2);
    expect(compareSurvivalToGhost([0, 1000, 4000, 9000], 1, 20000)).toBe(-3);
  });

  it("describes the comparison", () => {
    expect(describeMatchRaceGhost(1400)).toEqual({ text: "1.4 s ahead of your ghost", tone: "ahead" });
    expect(describeMatchRaceGhost(-2100)).toEqual({ text: "2.1 s behind your ghost", tone: "behind" });
    expect(describeMatchRaceGhost(20).tone).toBe("level");
    expect(describeMatchRaceGhost(null)).toEqual({ text: "First run: this is your ghost now.", tone: "first" });
    expect(describeSurvivalGhost(3, 42500).text).toBe("3 answers ahead of your ghost at 0:42");
    expect(describeSurvivalGhost(-1, 65000).text).toBe("1 answer behind your ghost at 1:05");
    expect(describeSurvivalGhost(0, 42500).text).toBe("Level with your ghost at 0:42");
    expect(describeSurvivalGhost(null, 0).tone).toBe("first");
  });

  it("caps marks per entry and entries overall, dropping the oldest", () => {
    const long = Array.from({ length: MAX_GHOST_MARKS + 50 }, (_, i) => i * 10);
    writeSurvivalGhostIfBetter("long", long);
    expect(readGhost("long")).toHaveLength(MAX_GHOST_MARKS);
    for (let i = 0; i < 25; i += 1) writeSurvivalGhostIfBetter(`k${i}`, [0]);
    expect(readGhost("long")).toBeNull();
    expect(readGhost("k0")).toBeNull();
    expect(readGhost("k24")).toEqual([0]);
    expect(Object.keys(JSON.parse(window.localStorage.getItem(GHOST_STORAGE_KEY)!))).toHaveLength(20);
  });

  it("ignores corrupt storage and keeps working in memory when writes fail", () => {
    window.localStorage.setItem(GHOST_STORAGE_KEY, "{not json");
    expect(readGhost("x")).toBeNull();
    window.localStorage.setItem(
      GHOST_STORAGE_KEY,
      JSON.stringify({ x: { v: 1, savedAt: 1, marks: [5, 1] }, y: { v: 2, marks: [1] } }),
    );
    expect(readGhost("x")).toBeNull();
    expect(readGhost("y")).toBeNull();

    window.localStorage.setItem = () => {
      throw new Error("quota");
    };
    expect(() => writeSurvivalGhostIfBetter("m", [0, 1])).not.toThrow();
    expect(readGhost("m")).toEqual([0, 1]);
  });
});
