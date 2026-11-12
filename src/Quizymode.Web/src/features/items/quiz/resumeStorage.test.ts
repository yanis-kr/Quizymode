import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryLocalStorage } from "@/test/memoryStorage";
import { createQuizRun, reduceQuizRun, type QuizRunState } from "./quizRun";
import {
  RESUME_MAX_DOCUMENT_BYTES,
  RESUME_MAX_ENTRIES,
  RESUME_STORAGE_KEY,
  RESUME_TTL_MS,
  describeResumeProgress,
  isResumableRun,
  itemFingerprint,
  purgeSignedInResumeEntries,
  readResumeEntry,
  removeResumeEntry,
  writeResumeEntry,
  type StoredResumeEntry,
} from "./resumeStorage";
import { entryMatchesStudyUrl, prepareResume } from "./resumeRestore";
import type { ItemResponse } from "@/types/api";

const NOW = Date.parse("2026-11-11T12:00:00.000Z");
const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";
const COLLECTION_ID = "44444444-4444-4444-8444-444444444444";

const item = (id: string, question = `Question ${id}`): ItemResponse =>
  ({
    id,
    category: "exams",
    isPrivate: false,
    question,
    correctAnswer: "4",
    incorrectAnswers: ["1", "2", "3"],
    explanation: "",
    createdAt: "2026-03-22T00:00:00Z",
    keywords: [],
    collections: [],
  }) as unknown as ItemResponse;

const categoryScope = { kind: "category" as const, category: "exams", navigationKeywords: [], filterKeywords: [], quizSize: 10 };

function answeredRun(identityKey: string, mode: "practice" | "test" = "practice"): QuizRunState {
  let run = createQuizRun(categoryScope, [ID_1, ID_2], identityKey, mode);
  if (mode === "test") run = reduceQuizRun(run, { type: "start-test", startedAt: new Date(NOW).toISOString(), timeLimitSec: 600 });
  return reduceQuizRun(run, { type: "answer", itemId: ID_1, selectedAnswer: "4", isCorrect: true, completedAt: new Date(NOW).toISOString() });
}

function entryFor(identityKey: string, run: QuizRunState = answeredRun(identityKey)): Omit<StoredResumeEntry, "savedAt"> {
  return {
    identityKey,
    label: "exams",
    resumePath: `/quiz/exams/item/${ID_2}`,
    startPath: "/quiz/exams",
    currentIndex: 1,
    run,
    fingerprints: { [ID_1]: itemFingerprint(item(ID_1)), [ID_2]: itemFingerprint(item(ID_2)) },
  };
}

describe("resumeStorage (AC 3.6.24)", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = installMemoryLocalStorage();
  });

  it("writes a versioned document and reads it back for the same identity", () => {
    expect(writeResumeEntry(entryFor("guest"), NOW)).toBe(true);
    const document = JSON.parse(storage.getItem(RESUME_STORAGE_KEY)!) as { version: number; entries: unknown[] };
    expect(document.version).toBe(1);
    expect(document.entries).toHaveLength(1);
    const entry = readResumeEntry("guest", NOW);
    expect(entry?.run.outcomes[ID_1]?.selectedAnswer).toBe("4");
    expect(entry?.savedAt).toBe(NOW);
    // No question or answer text is stored, only ids, progress and fingerprints.
    expect(storage.getItem(RESUME_STORAGE_KEY)).not.toContain("Question");
  });

  it("keeps one entry per identity and never returns another identity's entry", () => {
    writeResumeEntry(entryFor("guest"), NOW);
    writeResumeEntry(entryFor("user:a"), NOW + 1);
    const replacement = entryFor("user:a");
    writeResumeEntry(replacement, NOW + 2);
    expect(readResumeEntry("user:a", NOW + 2)?.run.runId).toBe(replacement.run.runId);
    expect(readResumeEntry("user:b", NOW + 2)).toBeNull();
    expect(readResumeEntry("guest", NOW + 2)?.identityKey).toBe("guest");
    const document = JSON.parse(storage.getItem(RESUME_STORAGE_KEY)!) as { entries: unknown[] };
    expect(document.entries).toHaveLength(2);
  });

  it("evicts the least recently used identity beyond the cap", () => {
    for (let index = 0; index <= RESUME_MAX_ENTRIES; index += 1) writeResumeEntry(entryFor(`user:${index}`), NOW + index);
    expect(readResumeEntry("user:0", NOW + 10)).toBeNull();
    expect(readResumeEntry(`user:${RESUME_MAX_ENTRIES}`, NOW + 10)).not.toBeNull();
  });

  it("expires entries after the TTL and ignores future timestamps", () => {
    writeResumeEntry(entryFor("guest"), NOW);
    expect(readResumeEntry("guest", NOW + RESUME_TTL_MS)).not.toBeNull();
    expect(readResumeEntry("guest", NOW + RESUME_TTL_MS + 1)).toBeNull();
    writeResumeEntry(entryFor("guest"), NOW + 60 * 60 * 1000);
    expect(readResumeEntry("guest", NOW)).toBeNull();
  });

  it("ignores corrupt, incompatible and malformed documents without throwing", () => {
    storage.setItem(RESUME_STORAGE_KEY, "{not json");
    expect(readResumeEntry("guest", NOW)).toBeNull();
    storage.setItem(RESUME_STORAGE_KEY, JSON.stringify({ version: 2, entries: [] }));
    expect(readResumeEntry("guest", NOW)).toBeNull();
    const bad = { ...entryFor("guest"), savedAt: NOW, resumePath: "https://evil.example/quiz" };
    storage.setItem(RESUME_STORAGE_KEY, JSON.stringify({ version: 1, entries: [bad] }));
    expect(readResumeEntry("guest", NOW)).toBeNull();
    const otherIdentityRun = { ...entryFor("guest"), savedAt: NOW, run: answeredRun("user:x") };
    storage.setItem(RESUME_STORAGE_KEY, JSON.stringify({ version: 1, entries: [otherIdentityRun] }));
    expect(readResumeEntry("guest", NOW)).toBeNull();
    // A corrupt document is replaced by the next write.
    expect(writeResumeEntry(entryFor("guest"), NOW)).toBe(true);
    expect(readResumeEntry("guest", NOW)).not.toBeNull();
  });

  it("never stores a run without progress or a completed run", () => {
    const fresh = createQuizRun(categoryScope, [ID_1, ID_2], "guest");
    expect(isResumableRun(fresh)).toBe(false);
    expect(writeResumeEntry(entryFor("guest", fresh), NOW)).toBe(false);
    let complete = answeredRun("guest");
    complete = reduceQuizRun(complete, { type: "answer", itemId: ID_2, selectedAnswer: "4", isCorrect: true, completedAt: new Date(NOW).toISOString() });
    expect(isResumableRun(complete)).toBe(false);
    const setupTest = createQuizRun(categoryScope, [ID_1, ID_2], "guest", "test");
    expect(isResumableRun(setupTest)).toBe(false);
    const startedTest = reduceQuizRun(setupTest, { type: "start-test", startedAt: new Date(NOW).toISOString(), timeLimitSec: null });
    expect(isResumableRun(startedTest)).toBe(true);
  });

  it("removes only the matching run, and sign-out purges signed-in entries but keeps the guest's", () => {
    const guest = entryFor("guest");
    writeResumeEntry(guest, NOW);
    writeResumeEntry(entryFor("user:a"), NOW);
    removeResumeEntry("guest", "other-run");
    expect(readResumeEntry("guest", NOW)).not.toBeNull();
    removeResumeEntry("guest", guest.run.runId);
    expect(readResumeEntry("guest", NOW)).toBeNull();
    writeResumeEntry(entryFor("guest"), NOW);
    purgeSignedInResumeEntries();
    expect(readResumeEntry("user:a", NOW)).toBeNull();
    expect(readResumeEntry("guest", NOW)).not.toBeNull();
  });

  it("returns false and never throws when storage is unavailable or full", () => {
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(writeResumeEntry(entryFor("guest"), NOW)).toBe(false);
    expect(readResumeEntry("guest", NOW)).toBeNull();
    expect(() => removeResumeEntry("guest")).not.toThrow();
    expect(() => purgeSignedInResumeEntries()).not.toThrow();
  });

  it("refuses an entry that does not fit the size cap", () => {
    const ids = Array.from({ length: 8000 }, (_, index) => `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`);
    let run = createQuizRun({ ...categoryScope, quizSize: 1000 }, ids, "guest");
    run = reduceQuizRun(run, { type: "answer", itemId: ids[0], selectedAnswer: "4", isCorrect: true, completedAt: new Date(NOW).toISOString() });
    const big = { ...entryFor("guest", run), fingerprints: Object.fromEntries(ids.map((id) => [id, "abc"])) };
    expect(JSON.stringify(big).length).toBeGreaterThan(RESUME_MAX_DOCUMENT_BYTES);
    expect(writeResumeEntry(big, NOW)).toBe(false);
  });

  it("describes progress and the Test time left", () => {
    writeResumeEntry(entryFor("guest", answeredRun("guest", "test")), NOW);
    const entry = readResumeEntry("guest", NOW)!;
    expect(describeResumeProgress(entry, NOW + 60_000)).toEqual({ answered: 1, total: 2, remainingSec: 540 });
    expect(describeResumeProgress(entry, NOW + 3_600_000).remainingSec).toBe(0);
  });
});

describe("resumeRestore (AC 3.6.24)", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  const stored = (run: QuizRunState = answeredRun("guest")): StoredResumeEntry => ({ ...entryFor("guest", run), savedAt: NOW });

  it("matches only the saved scope and mode", () => {
    const entry = stored();
    const url = { categorySlug: "exams", mode: "practice" as const, navigationKeywords: [], filterKeywords: [], size: null };
    expect(entryMatchesStudyUrl(entry, url)).toBe(true);
    expect(entryMatchesStudyUrl(entry, { ...url, mode: "test" })).toBe(false);
    expect(entryMatchesStudyUrl(entry, { ...url, categorySlug: "science" })).toBe(false);
    expect(entryMatchesStudyUrl(entry, { ...url, navigationKeywords: ["aws"] })).toBe(false);
    expect(entryMatchesStudyUrl(entry, { ...url, size: 5 })).toBe(false);
    expect(entryMatchesStudyUrl(entry, { ...url, categorySlug: undefined, collectionId: COLLECTION_ID })).toBe(false);
  });

  it("refetches the items and builds the restore snapshot", async () => {
    const getById = vi.fn((id: string) => Promise.resolve(item(id)));
    const context = await prepareResume(stored(), { getById, getCollectionItems: vi.fn() });
    expect(getById).toHaveBeenCalledTimes(2);
    expect(context?.itemIds).toEqual([ID_1, ID_2]);
    expect(context?.items?.map((entry) => entry.id)).toEqual([ID_1, ID_2]);
    expect(context?.category).toBe("exams");
    expect(context?.currentIndex).toBe(1);
  });

  it("rejects deleted, inaccessible, changed and unplayable questions", async () => {
    const entry = stored();
    const missing = vi.fn((id: string) => (id === ID_2 ? Promise.reject(new Error("404")) : Promise.resolve(item(id))));
    expect(await prepareResume(entry, { getById: missing, getCollectionItems: vi.fn() })).toBeNull();
    const changed = vi.fn((id: string) => Promise.resolve(item(id, id === ID_2 ? "Edited question" : undefined)));
    expect(await prepareResume(entry, { getById: changed, getCollectionItems: vi.fn() })).toBeNull();
    const unplayable = vi.fn((id: string) => Promise.resolve({ ...item(id), incorrectAnswers: ["4"] } as ItemResponse));
    expect(await prepareResume(entry, { getById: unplayable, getCollectionItems: vi.fn() })).toBeNull();
  });

  it("rejects a collection whose roster changed", async () => {
    let run = createQuizRun({ kind: "collection", collectionId: COLLECTION_ID }, [ID_1, ID_2], "guest");
    run = reduceQuizRun(run, { type: "answer", itemId: ID_1, selectedAnswer: "4", isCorrect: true, completedAt: new Date(NOW).toISOString() });
    const entry = { ...stored(run), resumePath: `/quiz/collections/${COLLECTION_ID}/item/${ID_1}`, startPath: `/quiz/collections/${COLLECTION_ID}` };
    const same = vi.fn(() => Promise.resolve({ items: [item(ID_1), item(ID_2)] }));
    expect((await prepareResume(entry, { getById: vi.fn(), getCollectionItems: same }))?.collectionId).toBe(COLLECTION_ID);
    const shrunk = vi.fn(() => Promise.resolve({ items: [item(ID_1)] }));
    expect(await prepareResume(entry, { getById: vi.fn(), getCollectionItems: shrunk })).toBeNull();
  });
});
