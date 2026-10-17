import type { QuizCompletionSnapshot } from "@/features/items/quiz/quizRun";
import { categoryNameToSlug } from "@/utils/categorySlug";
import { NAV_KEYWORD_MAX_LEN, NAV_KEYWORD_PATTERN } from "@/utils/navigationKeywordRules";

/**
 * Browser-local guest quiz history (issue #113, AC 3.0.15–3.0.19, AC 3.6.13).
 *
 * One localStorage document holds bounded completed-run summaries for anonymous players only.
 * It never stores question/answer text, selected answers, URLs, search text, emails, tokens,
 * or a persistent visitor identifier. Concurrent writes from two tabs are best-effort: each write
 * rereads and merges by run ID, but there is no lock, so a truly simultaneous write can lose one result.
 */
export const GUEST_HISTORY_STORAGE_KEY = "quizymode.guest.v1";
export const GUEST_HISTORY_SCHEMA_VERSION = 1;
export const GUEST_HISTORY_CHANGED_EVENT = "quizymode:guest-history-changed";
export const GUEST_HISTORY_MAX_SUMMARIES = 50;
export const GUEST_HISTORY_MAX_MISSED_REFERENCES = 200;
export const GUEST_HISTORY_RETENTION_DAYS = 90;
export const GUEST_HISTORY_MAX_DOCUMENT_BYTES = 128 * 1024;
export const GUEST_HISTORY_MAX_TOTAL = 1000;
export const GUEST_HISTORY_MAX_RUN_ID_LENGTH = 128;

const MAX_KEYWORDS_PER_LIST = 10;
const MAX_CATEGORY_SLUG_LENGTH = 64;
const MAX_TIMESTAMP_LENGTH = 40;
/** Tolerates small clock differences between tabs; anything later is treated as an invalid future timestamp. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const RETENTION_MS = GUEST_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_ID_PATTERN = /^[A-Za-z0-9-]+$/;
const CATEGORY_SLUG_PATTERN = /^[a-z0-9_-]+$/;

export type GuestHistorySource =
  | { kind: "collection"; collectionId: string }
  | { kind: "category"; categorySlug: string; navigationKeywords: string[]; filterKeywords: string[] }
  | { kind: "global"; filterKeywords: string[] };

export interface GuestRunSummary {
  runId: string;
  completedAt: string;
  correct: number;
  total: number;
  /** Null when the completed scope had no identifiers that can build a safe practice link. */
  source: GuestHistorySource | null;
  missedItemIds: string[];
}

export interface GuestHistoryEligibility {
  isAuthenticated: boolean;
  isAuthLoading?: boolean;
  /** Identity the run was started under (QuizRunState.identityKey). */
  runIdentityKey: string;
  /** Identity at completion time. */
  currentIdentityKey: string;
}

/** Summaries that could not be persisted (storage unavailable or full); kept for this page session only. */
let unsavedSummaries: GuestRunSummary[] = [];

function isGuid(value: unknown): value is string {
  return typeof value === "string" && GUID_PATTERN.test(value);
}

function isKeyword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= NAV_KEYWORD_MAX_LEN &&
    NAV_KEYWORD_PATTERN.test(value)
  );
}

function readKeywordList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_KEYWORDS_PER_LIST) return null;
  if (!value.every(isKeyword)) return null;
  return Array.from(new Set(value as string[]));
}

function isValidRunId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= GUEST_HISTORY_MAX_RUN_ID_LENGTH &&
    RUN_ID_PATTERN.test(value)
  );
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= GUEST_HISTORY_MAX_TOTAL;
}

function timestampIsRetained(value: unknown, now: number): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TIMESTAMP_LENGTH) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  if (time > now + FUTURE_SKEW_MS) return false;
  return now - time <= RETENTION_MS;
}

function readSource(value: unknown): GuestHistorySource | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "collection") {
    return isGuid(candidate.collectionId) ? { kind: "collection", collectionId: candidate.collectionId } : undefined;
  }
  if (candidate.kind === "category") {
    const slug = candidate.categorySlug;
    const navigationKeywords = readKeywordList(candidate.navigationKeywords);
    const filterKeywords = readKeywordList(candidate.filterKeywords);
    if (
      typeof slug !== "string" ||
      slug.length === 0 ||
      slug.length > MAX_CATEGORY_SLUG_LENGTH ||
      !CATEGORY_SLUG_PATTERN.test(slug) ||
      !navigationKeywords ||
      !filterKeywords
    ) {
      return undefined;
    }
    return { kind: "category", categorySlug: slug, navigationKeywords, filterKeywords };
  }
  if (candidate.kind === "global") {
    const filterKeywords = readKeywordList(candidate.filterKeywords);
    return filterKeywords ? { kind: "global", filterKeywords } : undefined;
  }
  return undefined;
}

/** Validates one stored summary, reading only known fields. Returns null when invalid. */
export function readGuestRunSummary(value: unknown, now: number = Date.now()): GuestRunSummary | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const { runId, completedAt, correct, total, missedItemIds } = candidate;
  if (!isValidRunId(runId)) return null;
  if (!timestampIsRetained(completedAt, now)) return null;
  if (!isCount(correct) || !isCount(total) || total === 0 || correct > total) return null;
  const source = readSource(candidate.source);
  if (source === undefined) return null;
  if (!Array.isArray(missedItemIds) || !missedItemIds.every(isGuid)) return null;
  const uniqueMissed = Array.from(new Set(missedItemIds as string[]));
  if (uniqueMissed.length !== missedItemIds.length) return null;
  if (uniqueMissed.length > total - correct) return null;
  return {
    runId,
    completedAt,
    correct,
    total,
    source,
    missedItemIds: uniqueMissed,
  };
}

/**
 * Applies retention: drops expired entries, dedupes by run ID (first occurrence wins), keeps the newest 50,
 * and keeps at most 200 missed-item references across them, trimming the oldest summaries' references first.
 * Scores are never changed by pruning.
 */
export function pruneGuestHistory(summaries: GuestRunSummary[], now: number = Date.now()): GuestRunSummary[] {
  const seen = new Set<string>();
  const retained = summaries
    .filter((summary) => timestampIsRetained(summary.completedAt, now))
    .filter((summary) => {
      if (seen.has(summary.runId)) return false;
      seen.add(summary.runId);
      return true;
    })
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
    .slice(0, GUEST_HISTORY_MAX_SUMMARIES);

  let remaining = GUEST_HISTORY_MAX_MISSED_REFERENCES;
  return retained.map((summary) => {
    const missedItemIds = summary.missedItemIds.slice(0, Math.max(0, remaining));
    remaining -= missedItemIds.length;
    return { ...summary, missedItemIds };
  });
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Parses the raw document. Oversized, corrupt, or unsupported-version documents yield an empty history. */
export function parseGuestHistoryDocument(raw: string | null, now: number = Date.now()): GuestRunSummary[] {
  if (raw === null || raw.length === 0) return [];
  // A UTF-8 byte is at least one UTF-16 code unit, so this cheap check runs before encoding huge strings.
  if (raw.length > GUEST_HISTORY_MAX_DOCUMENT_BYTES || utf8Length(raw) > GUEST_HISTORY_MAX_DOCUMENT_BYTES) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const document = parsed as Record<string, unknown>;
  // v1 is the only supported schema; unsupported versions are discarded rather than migrated.
  if (document.version !== GUEST_HISTORY_SCHEMA_VERSION || !Array.isArray(document.summaries)) return [];
  const summaries = document.summaries
    .slice(0, GUEST_HISTORY_MAX_SUMMARIES * 2)
    .map((value) => readGuestRunSummary(value, now))
    .filter((summary): summary is GuestRunSummary => summary !== null);
  return pruneGuestHistory(summaries, now);
}

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readStored(now: number): { summaries: GuestRunSummary[]; available: boolean } {
  const storage = getStorage();
  if (!storage) return { summaries: [], available: false };
  try {
    return { summaries: parseGuestHistoryDocument(storage.getItem(GUEST_HISTORY_STORAGE_KEY), now), available: true };
  } catch {
    return { summaries: [], available: false };
  }
}

function notifyChanged(): void {
  try {
    window.dispatchEvent(new Event(GUEST_HISTORY_CHANGED_EVENT));
  } catch {
    // Notification is a UI refresh aid only.
  }
}

/** Reads retained guest summaries, newest first. Never throws. */
export function readGuestHistory(now: number = Date.now()): GuestRunSummary[] {
  const { summaries } = readStored(now);
  return pruneGuestHistory([...unsavedSummaries, ...summaries], now);
}

/** Converts the immutable completion snapshot into the minimal stored summary. Returns null when it cannot be stored safely. */
export function summaryFromCompletionSnapshot(
  snapshot: QuizCompletionSnapshot,
  now: number = Date.now(),
): GuestRunSummary | null {
  let source: GuestHistorySource | null = null;
  const scope = snapshot.scope;
  if (scope.kind === "collection") {
    source = isGuid(scope.collectionId) ? { kind: "collection", collectionId: scope.collectionId } : null;
  } else {
    // Keyword lists that are not canonical slugs are dropped, widening practice to the enclosing topic.
    const navigationKeywords = readKeywordList([...scope.navigationKeywords]) ?? [];
    const filterKeywords = readKeywordList([...scope.filterKeywords]) ?? [];
    if (scope.kind === "category" && scope.category) {
      const categorySlug = categoryNameToSlug(scope.category);
      if (
        categorySlug.length > 0 &&
        categorySlug.length <= MAX_CATEGORY_SLUG_LENGTH &&
        CATEGORY_SLUG_PATTERN.test(categorySlug)
      ) {
        source = { kind: "category", categorySlug, navigationKeywords, filterKeywords };
      }
    } else if (scope.kind === "global") {
      source = { kind: "global", filterKeywords };
    }
  }

  const missedLimit = Math.min(snapshot.total - snapshot.correct, GUEST_HISTORY_MAX_MISSED_REFERENCES);
  const missedItemIds = Array.from(new Set(snapshot.missedItemIds.filter(isGuid))).slice(0, Math.max(0, missedLimit));
  return readGuestRunSummary(
    {
      runId: snapshot.runId,
      completedAt: snapshot.completedAt,
      correct: snapshot.correct,
      total: snapshot.total,
      source,
      missedItemIds,
    },
    now,
  );
}

/** True only for a run started and completed anonymously, with auth state settled. */
export function isGuestEligible(eligibility: GuestHistoryEligibility): boolean {
  return (
    !eligibility.isAuthenticated &&
    !eligibility.isAuthLoading &&
    eligibility.runIdentityKey === "guest" &&
    eligibility.currentIdentityKey === "guest"
  );
}

/**
 * Upserts a completed anonymous run by run ID after rereading and merging the stored document.
 * Returns the resulting history. Storage failures keep the result in memory and never throw.
 */
export function recordGuestCompletion(
  snapshot: QuizCompletionSnapshot,
  eligibility: GuestHistoryEligibility,
  now: number = Date.now(),
): GuestRunSummary[] {
  if (!isGuestEligible(eligibility)) return readGuestHistory(now);
  const summary = summaryFromCompletionSnapshot(snapshot, now);
  if (!summary) return readGuestHistory(now);

  const stored = readStored(now);
  const existing = stored.summaries.find((entry) => entry.runId === summary.runId);
  const merged = pruneGuestHistory(
    existing ? [...unsavedSummaries, ...stored.summaries] : [summary, ...unsavedSummaries, ...stored.summaries],
    now,
  );

  let saved = false;
  const storage = getStorage();
  if (storage && stored.available) {
    try {
      storage.setItem(
        GUEST_HISTORY_STORAGE_KEY,
        JSON.stringify({ version: GUEST_HISTORY_SCHEMA_VERSION, summaries: merged }),
      );
      saved = true;
    } catch {
      // Quota or access failure: keep the result for this page session only.
    }
  }
  unsavedSummaries = saved ? [] : merged.filter((entry) => !stored.summaries.some((s) => s.runId === entry.runId));
  notifyChanged();
  return merged;
}

/** Removes only the guest history document. Returns false when the stored copy could not be removed. */
export function clearGuestHistory(): boolean {
  unsavedSummaries = [];
  let cleared = true;
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(GUEST_HISTORY_STORAGE_KEY);
    } catch {
      cleared = false;
    }
  }
  notifyChanged();
  return cleared;
}

/** Test-only reset of the in-memory fallback. */
export function resetGuestHistoryMemoryForTests(): void {
  unsavedSummaries = [];
}
