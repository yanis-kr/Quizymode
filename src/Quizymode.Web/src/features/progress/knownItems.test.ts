import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import type { QuizCompletionSnapshot } from "@/features/items/quiz/quizRun";
import {
  KNOWN_ITEMS_STORAGE_KEY,
  categorySetKey,
  collectionSetKey,
  readKnownCount,
  recordKnownItems,
} from "./knownItems";

function snapshot(overrides: Partial<QuizCompletionSnapshot> = {}): QuizCompletionSnapshot {
  return {
    runId: "r1",
    scope: { kind: "category", category: "Trivia", navigationKeywords: ["brain-teasers", "aha"], filterKeywords: [], quizSize: 5 },
    completedAt: "2026-11-15T00:00:00.000Z",
    correct: 2,
    total: 3,
    missedItemIds: ["c"],
    correctItemIds: ["a", "b"],
    ...overrides,
  };
}

describe("knownItems", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = installMemoryLocalStorage();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("AC 3.33.1 counts correct answers toward the set and its enclosing sets", () => {
    recordKnownItems(snapshot());
    expect(readKnownCount(categorySetKey("trivia", ["brain-teasers", "aha"]))).toBe(2);
    expect(readKnownCount(categorySetKey("trivia", ["brain-teasers"]))).toBe(2);
    expect(readKnownCount(categorySetKey("trivia", []))).toBe(2);
    expect(readKnownCount(categorySetKey("other", []))).toBe(0);
  });

  it("AC 3.33.1 a later wrong answer removes the item from known and repeats do not double count", () => {
    recordKnownItems(snapshot());
    recordKnownItems(snapshot({ runId: "r2", correctItemIds: ["a", "d"], missedItemIds: ["b"] }));
    expect(readKnownCount(categorySetKey("trivia", ["brain-teasers", "aha"]))).toBe(2);
    const doc = JSON.parse(storage.getItem(KNOWN_ITEMS_STORAGE_KEY) ?? "{}") as Record<string, string[]>;
    expect(doc["s/trivia/brain-teasers/aha"]!.sort()).toEqual(["a", "d"]);
  });

  it("AC 3.33.1 tracks collections by id", () => {
    recordKnownItems(snapshot({ scope: { kind: "collection", collectionId: "ABC" }, correctItemIds: ["x"], missedItemIds: [] }));
    expect(readKnownCount(collectionSetKey("abc"))).toBe(1);
  });

  it("AC 3.33.2 guest progress stays in browser storage and is never sent to the server", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const beacon = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    recordKnownItems(snapshot());
    expect(storage.getItem(KNOWN_ITEMS_STORAGE_KEY)).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it("tolerates corrupt storage", () => {
    storage.setItem(KNOWN_ITEMS_STORAGE_KEY, "{not json");
    expect(readKnownCount("s/trivia")).toBe(0);
    recordKnownItems(snapshot());
    expect(readKnownCount("s/trivia")).toBe(2);
  });
});
