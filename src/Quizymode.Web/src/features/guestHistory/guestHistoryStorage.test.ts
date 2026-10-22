import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import type { QuizCompletionSnapshot } from "@/features/items/quiz/quizRun";
import {
  GUEST_HISTORY_MAX_DOCUMENT_BYTES,
  GUEST_HISTORY_STORAGE_KEY,
  clearGuestHistory,
  isGuestEligible,
  parseGuestHistoryDocument,
  pruneGuestHistory,
  readGuestHistory,
  readGuestRunSummary,
  recordGuestCompletion,
  resetGuestHistoryMemoryForTests,
  summaryFromCompletionSnapshot,
  type GuestHistorySource,
  type GuestRunSummary,
} from "./guestHistoryStorage";
import { buildGuestBrowsePath, buildGuestPracticePath } from "./guestHistoryLinks";

const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const COLLECTION_ID = "8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511";
const guest = { isAuthenticated: false, runIdentityKey: "guest", currentIdentityKey: "guest" };

function guid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function iso(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString();
}

function snapshot(overrides: Partial<QuizCompletionSnapshot> = {}): QuizCompletionSnapshot {
  return {
    runId: "run-1",
    scope: { kind: "collection", collectionId: COLLECTION_ID },
    completedAt: iso(1000),
    correct: 3,
    total: 5,
    missedItemIds: [guid(1), guid(2)],
    ...overrides,
  };
}

function summary(index: number, overrides: Partial<GuestRunSummary> = {}): GuestRunSummary {
  return {
    runId: `run-${index}`,
    completedAt: iso(index * 1000),
    correct: 0,
    total: 10,
    source: { kind: "collection", collectionId: COLLECTION_ID },
    missedItemIds: [],
    mode: "quiz",
    ...overrides,
  };
}

function storedDocument(storage: Storage): { version: number; summaries: GuestRunSummary[] } {
  return JSON.parse(storage.getItem(GUEST_HISTORY_STORAGE_KEY) ?? "null");
}

describe("guestHistoryStorage", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = installMemoryLocalStorage();
    resetGuestHistoryMemoryForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stores only the minimal summary fields under the versioned key", () => {
    storage.setItem("quizymode.auth", "keep-me");
    recordGuestCompletion(snapshot(), guest, NOW);

    const document = storedDocument(storage);
    expect(document.version).toBe(2);
    expect(document.summaries).toEqual([
      {
        runId: "run-1",
        completedAt: iso(1000),
        correct: 3,
        total: 5,
        source: { kind: "collection", collectionId: COLLECTION_ID },
        missedItemIds: [guid(1), guid(2)],
        mode: "quiz",
      },
    ]);
    expect(storage.getItem("quizymode.auth")).toBe("keep-me");
  });

  it("upserts by run ID so remount/reload completions do not duplicate, while a replay adds one", () => {
    recordGuestCompletion(snapshot(), guest, NOW);
    recordGuestCompletion(snapshot(), guest, NOW);
    expect(readGuestHistory(NOW)).toHaveLength(1);

    recordGuestCompletion(snapshot({ runId: "run-2", completedAt: iso(0) }), guest, NOW);
    const history = readGuestHistory(NOW);
    expect(history.map((entry) => entry.runId)).toEqual(["run-2", "run-1"]);
  });

  it("does not copy authenticated, identity-changed, or auth-loading runs into guest history", () => {
    recordGuestCompletion(snapshot(), { ...guest, isAuthenticated: true, currentIdentityKey: "user:u1" }, NOW);
    recordGuestCompletion(snapshot(), { ...guest, runIdentityKey: "user:u1" }, NOW);
    recordGuestCompletion(snapshot(), { ...guest, currentIdentityKey: "user:u1" }, NOW);
    recordGuestCompletion(snapshot(), { ...guest, isAuthLoading: true }, NOW);
    expect(storage.getItem(GUEST_HISTORY_STORAGE_KEY)).toBeNull();
    expect(isGuestEligible(guest)).toBe(true);
  });

  it("rereads and merges stored summaries written by another tab before writing", () => {
    recordGuestCompletion(snapshot({ runId: "run-a", completedAt: iso(5000) }), guest, NOW);
    // Another tab writes its own result after this tab's last read.
    const other = storedDocument(storage);
    other.summaries.unshift(summary(1, { runId: "run-other" }));
    storage.setItem(GUEST_HISTORY_STORAGE_KEY, JSON.stringify(other));

    recordGuestCompletion(snapshot({ runId: "run-b", completedAt: iso(0) }), guest, NOW);
    expect(storedDocument(storage).summaries.map((entry) => entry.runId)).toEqual(["run-b", "run-other", "run-a"]);
  });

  it("keeps the newest 50 summaries", () => {
    const summaries = Array.from({ length: 55 }, (_, index) => summary(index));
    const pruned = pruneGuestHistory(summaries, NOW);
    expect(pruned).toHaveLength(50);
    expect(pruned[0].runId).toBe("run-0");
    expect(pruned[49].runId).toBe("run-49");
  });

  it("caps missed references at 200 across summaries, trimming the oldest first without changing scores", () => {
    const summaries = [0, 1, 2].map((index) =>
      summary(index, {
        correct: 0,
        total: 90,
        missedItemIds: Array.from({ length: 90 }, (_, item) => guid(index * 1000 + item)),
      }),
    );
    const pruned = pruneGuestHistory(summaries, NOW);
    expect(pruned.map((entry) => entry.missedItemIds.length)).toEqual([90, 90, 20]);
    expect(pruned.map((entry) => entry.total - entry.correct)).toEqual([90, 90, 90]);
  });

  it("discards summaries older than 90 days and future timestamps, keeping the boundary", () => {
    const raw = JSON.stringify({
      version: 1,
      summaries: [
        summary(1, { runId: "boundary", completedAt: iso(90 * DAY) }),
        summary(2, { runId: "expired", completedAt: iso(90 * DAY + 1) }),
        summary(3, { runId: "future", completedAt: new Date(NOW + DAY).toISOString() }),
        summary(4, { runId: "garbage-date", completedAt: "not-a-date" }),
      ],
    });
    expect(parseGuestHistoryDocument(raw, NOW).map((entry) => entry.runId)).toEqual(["boundary"]);
  });

  it("validates counts, identifiers, and uniqueness", () => {
    const invalid = [
      summary(1, { total: 0 }),
      summary(1, { correct: 11 }),
      summary(1, { total: 1001, correct: 0 }),
      summary(1, { correct: 1.5 }),
      summary(1, { runId: "x".repeat(129) }),
      summary(1, { runId: "../evil" }),
      summary(1, { missedItemIds: ["item-1"] }),
      summary(1, { missedItemIds: [guid(1), guid(1)] }),
      summary(1, { correct: 9, missedItemIds: [guid(1), guid(2)] }),
      summary(1, { source: { kind: "collection", collectionId: "https://evil.example" } }),
      summary(1, {
        source: { kind: "category", categorySlug: "exams", navigationKeywords: ["a".repeat(31)], filterKeywords: [] },
      }),
      summary(1, {
        source: { kind: "category", categorySlug: "/exams?x=1", navigationKeywords: [], filterKeywords: [] },
      }),
    ];
    for (const value of invalid) {
      expect(readGuestRunSummary(value, NOW)).toBeNull();
    }
    expect(readGuestRunSummary({ ...summary(1), url: "https://evil.example", question: "Q" }, NOW)).toEqual(summary(1));
  });

  it("treats corrupt, unsupported, and oversized documents as empty and overwrites them safely", () => {
    expect(parseGuestHistoryDocument("{bad json", NOW)).toEqual([]);
    expect(parseGuestHistoryDocument(JSON.stringify({ version: 3, summaries: [summary(1)] }), NOW)).toEqual([]);
    expect(parseGuestHistoryDocument(JSON.stringify({ version: 1, summaries: "nope" }), NOW)).toEqual([]);
    const oversized = JSON.stringify({
      version: 1,
      summaries: [summary(1)],
      padding: "é".repeat(GUEST_HISTORY_MAX_DOCUMENT_BYTES / 2),
    });
    expect(oversized.length).toBeLessThan(GUEST_HISTORY_MAX_DOCUMENT_BYTES);
    expect(parseGuestHistoryDocument(oversized, NOW)).toEqual([]);

    storage.setItem(GUEST_HISTORY_STORAGE_KEY, "{bad json");
    recordGuestCompletion(snapshot(), guest, NOW);
    expect(storedDocument(storage).summaries).toHaveLength(1);
  });

  it("keeps gameplay usable with in-memory history when storage is unavailable or full", () => {
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => recordGuestCompletion(snapshot(), guest, NOW)).not.toThrow();
    expect(readGuestHistory(NOW)).toHaveLength(1);

    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => recordGuestCompletion(snapshot({ runId: "run-2", completedAt: iso(2000) }), guest, NOW)).not.toThrow();
    expect(readGuestHistory(NOW).map((entry) => entry.runId)).toEqual(["run-1", "run-2"]);
  });

  it("clears only the guest document and reports removal failures", () => {
    storage.setItem("quizymode.auth", "keep-me");
    recordGuestCompletion(snapshot(), guest, NOW);
    expect(clearGuestHistory()).toBe(true);
    expect(storage.getItem(GUEST_HISTORY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem("quizymode.auth")).toBe("keep-me");

    recordGuestCompletion(snapshot(), guest, NOW);
    vi.spyOn(storage, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(clearGuestHistory()).toBe(false);
    expect(storage.getItem("quizymode.auth")).toBe("keep-me");
  });

  it("omits missed IDs for perfect runs and derives missed count from total minus correct", () => {
    const perfect = summaryFromCompletionSnapshot(snapshot({ correct: 5, total: 5, missedItemIds: [] }), NOW);
    expect(perfect?.missedItemIds).toEqual([]);
    const pruned = summaryFromCompletionSnapshot(snapshot({ missedItemIds: ["not-a-guid", guid(1)] }), NOW);
    expect(pruned?.missedItemIds).toEqual([guid(1)]);
    expect(pruned!.total - pruned!.correct).toBe(2);
  });

  it("builds category/global sources from canonical identifiers and safe practice links via route helpers", () => {
    const category = summaryFromCompletionSnapshot(
      snapshot({
        scope: {
          kind: "category",
          category: "Exams",
          navigationKeywords: ["act", "math"],
          filterKeywords: ["algebra"],
          quizSize: 10,
        },
      }),
      NOW,
    );
    expect(category?.source).toEqual({
      kind: "category",
      categorySlug: "exams",
      navigationKeywords: ["act", "math"],
      filterKeywords: ["algebra"],
    });
    expect(buildGuestPracticePath(category!.source!)).toBe("/quiz/exams?nav=act%2Cmath&keywords=act%2Cmath%2Calgebra");
    expect(buildGuestBrowsePath(category!.source!)).toBe("/categories/exams/act/math");

    // A free-text-like filter keyword is not persisted; practice widens to the canonical topic.
    const global = summaryFromCompletionSnapshot(
      snapshot({
        scope: { kind: "global", category: null, navigationKeywords: [], filterKeywords: ["two words"], quizSize: 10 },
      }),
      NOW,
    );
    expect(global?.source).toEqual({ kind: "global", filterKeywords: [] });
    expect(buildGuestPracticePath(global!.source!)).toBe("/quiz");
    expect(buildGuestBrowsePath(global!.source!)).toBe("/categories");

    const collection = summaryFromCompletionSnapshot(snapshot(), NOW);
    expect(buildGuestPracticePath(collection!.source!)).toBe(`/quiz/collections/${COLLECTION_ID}`);

    const invalidCollection = summaryFromCompletionSnapshot(
      snapshot({ scope: { kind: "collection", collectionId: "collection-1" } }),
      NOW,
    );
    expect(invalidCollection?.source).toBeNull();
  });

  describe("session mode (issue #306)", () => {
    it("reads a v1 document as quiz runs and writes v2 with the mode", () => {
      const storage = installMemoryLocalStorage();
      resetGuestHistoryMemoryForTests();
      const legacy: Record<string, unknown> = { ...summary(1) };
      delete legacy.mode;
      storage.setItem(GUEST_HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, summaries: [legacy] }));
      expect(readGuestHistory(NOW)[0].mode).toBe("quiz");

      recordGuestCompletion(snapshot({ runId: "learn-1", mode: "learn" }), guest, NOW);
      const doc = storedDocument(storage);
      expect(doc.version).toBe(2);
      expect(doc.summaries.find((s) => s.runId === "learn-1")?.mode).toBe("learn");
      expect(doc.summaries.find((s) => s.runId === "run-1")?.mode).toBe("quiz");
    });

    it("defaults a snapshot without mode to quiz and ignores unknown modes", () => {
      expect(summaryFromCompletionSnapshot(snapshot(), NOW)?.mode).toBe("quiz");
      expect(readGuestRunSummary({ ...summary(1), mode: "bogus" }, NOW)?.mode).toBe("quiz");
      expect(readGuestRunSummary({ ...summary(1), mode: "learn" }, NOW)?.mode).toBe("learn");
    });

    it("builds learn practice paths with the same shape as quiz", () => {
      expect(buildGuestPracticePath({ kind: "collection", collectionId: COLLECTION_ID }, "learn")).toBe(
        `/learn/collections/${COLLECTION_ID}`,
      );
      const category: GuestHistorySource = { kind: "category", categorySlug: "science", navigationKeywords: ["space"], filterKeywords: [] };
      expect(buildGuestPracticePath(category, "learn")).toBe("/learn/science?nav=space&keywords=space");
      expect(buildGuestPracticePath(category)).toBe("/quiz/science?nav=space&keywords=space");
      expect(buildGuestPracticePath({ kind: "global", filterKeywords: ["math"] }, "learn")).toBe("/learn?keywords=math");
    });
  });
});
