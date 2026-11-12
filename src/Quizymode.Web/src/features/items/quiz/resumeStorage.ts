import type { ItemResponse } from "@/types/api";
import { sanitizeInAppPath } from "@/utils/safeInAppPath";
import {
  getQuizDistractors,
  getTestDeadlineMs,
  summarizeQuizRun,
  QUIZ_RUN_SCHEMA_VERSION,
  type QuizRunState,
} from "./quizRun";

/**
 * Browser-local resume point for an unfinished Quiz (Practice) or Test run (#602, AC 3.6.24). One localStorage
 * document holds at most one run per identity (`guest` or `user:<id>`), at most 3 identities (LRU), each for 7 days,
 * within 256 KB. It stores ids, progress and per-item fingerprints only, never question or answer text: every resume
 * refetches the items, so deleted, changed, inaccessible or unapproved questions are detected. The tab's
 * sessionStorage snapshot (`navigationContext_quiz`) still drives same-tab reload (AC 3.6.12).
 */
export const RESUME_STORAGE_KEY = "quizymode.resume.v1";
export const RESUME_STORAGE_VERSION = 1;
export const RESUME_MAX_ENTRIES = 3;
export const RESUME_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESUME_MAX_DOCUMENT_BYTES = 256 * 1024;

export interface StoredResumeEntry {
  identityKey: string;
  /** Epoch milliseconds of the last write; drives LRU order and the TTL. */
  savedAt: number;
  /** Topic or collection name shown on the Continue studying card. */
  label: string;
  /** Quiz item URL of the current question (keeps mode=test). */
  resumePath: string;
  /** Quiz URL of the same scope and mode with no item, used by Start over. */
  startPath: string;
  currentIndex: number;
  run: QuizRunState;
  /** Item id to a fingerprint of the question and its answers when saved. */
  fingerprints: Record<string, string>;
}

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Changes whenever the question, the correct answer or the playable distractors change. */
export function itemFingerprint(item: Pick<ItemResponse, "question" | "correctAnswer" | "incorrectAnswers">): string {
  return hashText(JSON.stringify([item.question ?? "", item.correctAnswer ?? "", getQuizDistractors(item)]));
}

/** True when the run has an answer, a skip or a started Test and is not yet complete. */
export function isResumableRun(run: QuizRunState): boolean {
  try {
    if (run.view !== "active") return false;
    const summary = summarizeQuizRun(run);
    if (summary.isComplete) return false;
    if (run.mode === "test") return run.startedAt !== null && run.submittedAt === null;
    return summary.answered + summary.skipped > 0;
  } catch {
    return false;
  }
}

function isSafeQuizPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/quiz") && sanitizeInAppPath(value) !== null;
}

function isValidEntry(value: unknown): value is StoredResumeEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<StoredResumeEntry>;
  if (
    typeof entry.identityKey !== "string" ||
    entry.identityKey.length === 0 ||
    typeof entry.savedAt !== "number" ||
    !Number.isFinite(entry.savedAt) ||
    typeof entry.label !== "string" ||
    !isSafeQuizPath(entry.resumePath) ||
    !isSafeQuizPath(entry.startPath) ||
    typeof entry.currentIndex !== "number" ||
    !Number.isInteger(entry.currentIndex) ||
    entry.currentIndex < 0 ||
    !entry.run ||
    typeof entry.run !== "object" ||
    !entry.fingerprints ||
    typeof entry.fingerprints !== "object"
  ) {
    return false;
  }
  const run = entry.run as Partial<QuizRunState>;
  if (
    run.schemaVersion !== QUIZ_RUN_SCHEMA_VERSION ||
    run.identityKey !== entry.identityKey ||
    (run.mode !== "practice" && run.mode !== "test") ||
    !Array.isArray(run.itemIds) ||
    run.itemIds.length === 0 ||
    !run.itemIds.every((id) => typeof id === "string") ||
    entry.currentIndex >= run.itemIds.length ||
    !run.outcomes ||
    typeof run.outcomes !== "object" ||
    !Array.isArray(run.skipped) ||
    !Array.isArray(run.flagged) ||
    !run.scope ||
    typeof run.scope !== "object"
  ) {
    return false;
  }
  const fingerprints = entry.fingerprints as Record<string, unknown>;
  if (!run.itemIds.every((id) => typeof fingerprints[id] === "string")) return false;
  // Full run validation happens on the quiz page with restoreQuizRun against the refetched roster.
  return isResumableRun(run as QuizRunState);
}

function readEntries(storage: Storage): StoredResumeEntry[] {
  try {
    const raw = storage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const document = parsed as { version?: unknown; entries?: unknown };
    if (document.version !== RESUME_STORAGE_VERSION || !Array.isArray(document.entries)) return [];
    return (document.entries as unknown[]).filter(isValidEntry);
  } catch {
    return [];
  }
}

function isFresh(entry: StoredResumeEntry, now: number): boolean {
  return now - entry.savedAt <= RESUME_TTL_MS && entry.savedAt <= now + 5 * 60 * 1000;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function writeEntries(storage: Storage, entries: StoredResumeEntry[]): boolean {
  try {
    if (entries.length === 0) {
      storage.removeItem(RESUME_STORAGE_KEY);
    } else {
      storage.setItem(RESUME_STORAGE_KEY, JSON.stringify({ version: RESUME_STORAGE_VERSION, entries }));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The saved unfinished run of this identity, or null. Expired, corrupt, incompatible and other identities' entries
 * are never returned, and reading never throws.
 */
export function readResumeEntry(identityKey: string, now: number = Date.now()): StoredResumeEntry | null {
  const storage = getStorage();
  if (!storage) return null;
  const entry = readEntries(storage).find((candidate) => candidate.identityKey === identityKey);
  return entry && isFresh(entry, now) ? entry : null;
}

/**
 * Replaces this identity's entry (most recently used first), keeps at most 3 identities within the size cap and
 * evicts the oldest other identity before a write is allowed to fail. Returns false when nothing could be written.
 */
export function writeResumeEntry(entry: Omit<StoredResumeEntry, "savedAt">, now: number = Date.now()): boolean {
  const storage = getStorage();
  if (!storage) return false;
  const next: StoredResumeEntry = { ...entry, savedAt: now };
  if (!isValidEntry(next)) return false;
  const kept = readEntries(storage)
    .filter((candidate) => candidate.identityKey !== entry.identityKey && isFresh(candidate, now))
    .sort((left, right) => right.savedAt - left.savedAt)
    .slice(0, RESUME_MAX_ENTRIES - 1);

  while (true) {
    const serialized = JSON.stringify({ version: RESUME_STORAGE_VERSION, entries: [next, ...kept] });
    if (utf8Length(serialized) <= RESUME_MAX_DOCUMENT_BYTES) {
      try {
        storage.setItem(RESUME_STORAGE_KEY, serialized);
        return true;
      } catch {
        // Quota or access failure: evict below and retry.
      }
    }
    if (kept.length === 0) return false;
    kept.pop();
  }
}

/** Drops this identity's entry; with `runId`, only when the entry is for that run. */
export function removeResumeEntry(identityKey: string, runId?: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (storage.getItem(RESUME_STORAGE_KEY) === null) return;
  } catch {
    return;
  }
  const entries = readEntries(storage);
  const remaining = entries.filter(
    (entry) => !(entry.identityKey === identityKey && (runId === undefined || entry.run.runId === runId)),
  );
  if (remaining.length !== entries.length || entries.length === 0) writeEntries(storage, remaining);
}

/** Sign-out (AC 3.6.24): drops every signed-in entry and keeps the guest's. Never throws. */
export function purgeSignedInResumeEntries(): void {
  const storage = getStorage();
  if (!storage) return;
  const entries = readEntries(storage);
  const remaining = entries.filter((entry) => !entry.identityKey.startsWith("user:"));
  try {
    if (storage.getItem(RESUME_STORAGE_KEY) === null) return;
  } catch {
    return;
  }
  writeEntries(storage, remaining);
}

export interface ResumeProgress {
  answered: number;
  total: number;
  /** Test with a limit: whole seconds left (0 once the deadline passed); null otherwise. */
  remainingSec: number | null;
}

export function describeResumeProgress(entry: StoredResumeEntry, now: number = Date.now()): ResumeProgress {
  const summary = summarizeQuizRun(entry.run);
  const deadline = entry.run.mode === "test" ? getTestDeadlineMs(entry.run) : null;
  return {
    answered: summary.answered + summary.skipped,
    total: summary.total,
    remainingSec: deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000)),
  };
}

function formatLastActivity(savedAt: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - savedAt) / 60000);
  if (minutes < 1) return "Last studied just now";
  if (minutes < 60) return `Last studied ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last studied ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `Last studied ${days} ${days === 1 ? "day" : "days"} ago`;
}

function formatTimeLeft(remainingSec: number): string {
  if (remainingSec <= 0) return "Time is up";
  const minutes = Math.ceil(remainingSec / 60);
  return `${minutes} min left`;
}

/** One line of progress for a saved run: mode, answered count, then time left (timed Test) or last activity. */
export function describeResumeEntry(entry: StoredResumeEntry, now: number = Date.now()): string {
  const progress = describeResumeProgress(entry, now);
  const mode = entry.run.mode === "test" ? "Test" : "Practice";
  const tail = progress.remainingSec !== null ? formatTimeLeft(progress.remainingSec) : formatLastActivity(entry.savedAt, now);
  return `${mode} · ${progress.answered} of ${progress.total} answered · ${tail}`;
}
