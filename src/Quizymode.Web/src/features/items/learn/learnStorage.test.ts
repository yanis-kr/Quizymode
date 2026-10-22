import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemResponse } from "@/types/api";
import type { QuizRunScope } from "@/features/items/quiz/quizRun";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { createLearnRun } from "./learnRun";
import {
  LEARN_MAX_DOCUMENT_BYTES,
  LEARN_MAX_RUNS,
  LEARN_STORAGE_KEY,
  LEARN_TTL_MS,
  learnScopeKey,
  purgeLearnRunsExcept,
  readLearnRun,
  removeLearnRun,
  writeLearnRun,
} from "./learnStorage";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const categoryScope = (category: string, quizSize = 10): QuizRunScope => ({
  kind: "category",
  category,
  navigationKeywords: [],
  filterKeywords: [],
  quizSize,
});
const collectionScope = (collectionId: string): QuizRunScope => ({ kind: "collection", collectionId });

function makeItem(id: string, explanation = ""): ItemResponse {
  return {
    id,
    category: "science",
    isPrivate: false,
    question: `Question ${id}`,
    correctAnswer: "right",
    incorrectAnswers: ["w1", "w2"],
    explanation,
    createdAt: "2026-01-01T00:00:00Z",
    keywords: [],
    collections: [],
  };
}
const items = (count: number, explanation = ""): ItemResponse[] =>
  Array.from({ length: count }, (_, index) => makeItem(`item-${index + 1}`, explanation));

interface StoredDocument {
  version: number;
  runs: Array<{ scopeKey: string; identityKey: string; savedAt: number; items?: unknown[]; state: { itemIds: string[] } }>;
}

function readDocument(): StoredDocument {
  return JSON.parse(localStorage.getItem(LEARN_STORAGE_KEY) ?? "null") as StoredDocument;
}

describe("learnStorage", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("normalizes the scope key", () => {
    expect(learnScopeKey(categoryScope("Science"))).toBe(learnScopeKey(categoryScope("science")));
    expect(learnScopeKey(categoryScope("science", 10))).not.toBe(learnScopeKey(categoryScope("science", 20)));
    expect(learnScopeKey(collectionScope("ABC"))).toBe(learnScopeKey(collectionScope("abc")));
  });

  it("round-trips a guest category run with its item snapshot", () => {
    const scope = categoryScope("science");
    const pool = items(4);
    const run = createLearnRun(scope, pool.map((item) => item.id), "guest");

    expect(writeLearnRun(scope, run, pool, NOW)).toBe(true);
    const result = readLearnRun(scope, "guest", NOW + 1000);

    expect(result.status).toBe("restored");
    if (result.status !== "restored") return;
    expect(result.state).toEqual(run);
    expect(result.items?.map((item) => item.id).sort()).toEqual(pool.map((item) => item.id).sort());
  });

  it("stores only ids and progress for signed-in category runs and collection runs", () => {
    const signedScope = categoryScope("science");
    const signedRun = createLearnRun(signedScope, items(3).map((item) => item.id), "user:1");
    writeLearnRun(signedScope, signedRun, items(3), NOW);
    const collection = collectionScope("c-1");
    const collectionRun = createLearnRun(collection, items(3).map((item) => item.id), "guest");
    writeLearnRun(collection, collectionRun, items(3), NOW);

    expect(readDocument().runs.every((entry) => entry.items === undefined)).toBe(true);
    expect(localStorage.getItem(LEARN_STORAGE_KEY)).not.toContain("Question item-");
    expect(readLearnRun(signedScope, "user:1", NOW)).toMatchObject({ status: "restored", items: null });
    expect(readLearnRun(collection, "guest", NOW)).toMatchObject({ status: "restored", items: null });
  });

  it("starts silently for other identities, other scopes, nothing stored and expired runs", () => {
    const scope = categoryScope("science");
    const run = createLearnRun(scope, items(3).map((item) => item.id), "guest");
    expect(readLearnRun(scope, "guest", NOW)).toEqual({ status: "none" });

    writeLearnRun(scope, run, items(3), NOW);
    expect(readLearnRun(scope, "user:1", NOW)).toEqual({ status: "none" });
    expect(readLearnRun(categoryScope("history"), "guest", NOW)).toEqual({ status: "none" });
    expect(readLearnRun(scope, "guest", NOW + LEARN_TTL_MS + 1)).toEqual({ status: "none" });
    expect(readLearnRun(scope, "guest", NOW + LEARN_TTL_MS - 1).status).toBe("restored");
  });

  it("reports corrupt documents and tampered runs as invalid", () => {
    const scope = categoryScope("science");
    localStorage.setItem(LEARN_STORAGE_KEY, "{not json");
    expect(readLearnRun(scope, "guest", NOW)).toEqual({ status: "invalid" });

    localStorage.setItem(LEARN_STORAGE_KEY, JSON.stringify({ version: 9, runs: [] }));
    expect(readLearnRun(scope, "guest", NOW)).toEqual({ status: "invalid" });

    const run = createLearnRun(scope, items(3).map((item) => item.id), "guest");
    writeLearnRun(scope, run, items(3), NOW);
    const doc = readDocument();
    doc.runs[0].state.itemIds = [];
    localStorage.setItem(LEARN_STORAGE_KEY, JSON.stringify(doc));
    expect(readLearnRun(scope, "guest", NOW)).toEqual({ status: "invalid" });
  });

  it("treats a guest run without a usable snapshot as invalid", () => {
    const scope = categoryScope("science");
    const run = createLearnRun(scope, items(3).map((item) => item.id), "guest");
    writeLearnRun(scope, run, items(3), NOW);
    const doc = readDocument();
    doc.runs[0].items = (doc.runs[0].items ?? []).slice(0, 2);
    localStorage.setItem(LEARN_STORAGE_KEY, JSON.stringify(doc));
    expect(readLearnRun(scope, "guest", NOW)).toEqual({ status: "invalid" });
  });

  it("keeps at most 3 runs and evicts the least recently used", () => {
    for (let index = 0; index < 5; index += 1) {
      const scope = categoryScope(`cat-${index}`);
      writeLearnRun(scope, createLearnRun(scope, ["item-1", "item-2"], "guest"), items(2), NOW + index * 1000);
    }
    const keys = readDocument().runs.map((entry) => entry.scopeKey);
    expect(keys).toHaveLength(LEARN_MAX_RUNS);
    expect(keys).toEqual([
      learnScopeKey(categoryScope("cat-4")),
      learnScopeKey(categoryScope("cat-3")),
      learnScopeKey(categoryScope("cat-2")),
    ]);
  });

  it("rewrites the same scope in place and moves it to the front", () => {
    const first = categoryScope("one");
    const second = categoryScope("two");
    const firstRun = createLearnRun(first, ["item-1", "item-2"], "guest");
    writeLearnRun(first, firstRun, items(2), NOW);
    writeLearnRun(second, createLearnRun(second, ["item-1", "item-2"], "guest"), items(2), NOW + 1000);
    writeLearnRun(first, firstRun, items(2), NOW + 2000);

    expect(readDocument().runs.map((entry) => entry.scopeKey)).toEqual([learnScopeKey(first), learnScopeKey(second)]);
  });

  it("evicts the oldest run before a write fails on the 256 KB cap", () => {
    const big = "x".repeat(2000);
    const writeRun = (name: string, at: number): boolean => {
      const scope = categoryScope(name, 50);
      const pool = items(50, big);
      return writeLearnRun(scope, createLearnRun(scope, pool.map((item) => item.id), "guest"), pool, at);
    };

    expect(writeRun("a", NOW)).toBe(true);
    expect(writeRun("b", NOW + 1)).toBe(true);
    expect(writeRun("c", NOW + 2)).toBe(true);

    const raw = localStorage.getItem(LEARN_STORAGE_KEY) ?? "";
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(LEARN_MAX_DOCUMENT_BYTES);
    const keys = readDocument().runs.map((entry) => entry.scopeKey);
    expect(keys[0]).toBe(learnScopeKey(categoryScope("c", 50)));
    expect(keys.length).toBeLessThan(3);
  });

  it("evicts older runs when setItem throws, and reports failure when nothing fits", () => {
    const scope = categoryScope("science");
    const other = categoryScope("other");
    writeLearnRun(other, createLearnRun(other, ["item-1", "item-2"], "guest"), items(2), NOW);
    const real = localStorage.setItem.bind(localStorage);
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const run = createLearnRun(scope, ["item-1", "item-2"], "guest");

    expect(writeLearnRun(scope, run, items(2), NOW + 1)).toBe(true);
    expect(readDocument().runs.map((entry) => entry.scopeKey)).toEqual([learnScopeKey(scope)]);

    setItem.mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(writeLearnRun(scope, run, items(2), NOW + 2)).toBe(false);
    setItem.mockImplementation(real);
  });

  it("removes one run", () => {
    const scope = categoryScope("science");
    writeLearnRun(scope, createLearnRun(scope, ["item-1", "item-2"], "guest"), items(2), NOW);
    removeLearnRun(scope, "guest");
    expect(localStorage.getItem(LEARN_STORAGE_KEY)).toBeNull();
  });

  it("purges every identity but the one kept, and a corrupt document", () => {
    const a = categoryScope("a");
    const b = categoryScope("b");
    const c = collectionScope("c-1");
    writeLearnRun(a, createLearnRun(a, ["item-1", "item-2"], "guest"), items(2), NOW);
    writeLearnRun(b, createLearnRun(b, ["item-1", "item-2"], "user:1"), items(2), NOW + 1);
    writeLearnRun(c, createLearnRun(c, ["item-1", "item-2"], "user:2"), items(2), NOW + 2);

    purgeLearnRunsExcept("guest");
    expect(readDocument().runs.map((entry) => entry.identityKey)).toEqual(["guest"]);

    purgeLearnRunsExcept("user:1");
    expect(localStorage.getItem(LEARN_STORAGE_KEY)).toBeNull();

    localStorage.setItem(LEARN_STORAGE_KEY, "garbage");
    purgeLearnRunsExcept("guest");
    expect(localStorage.getItem(LEARN_STORAGE_KEY)).toBeNull();
  });
});
