import { isTopicPath, mergeTopics } from "@/features/interests/topicPaths";

/**
 * Browser-local learning-loop state for anonymous visitors (epic #197).
 *
 * - `quizymode.daily.v1`: dates (UTC yyyy-MM-dd) of completed daily quizzes with their score, for the streak (#119).
 * - `quizymode.interests.v2`: explicit category[/l1[/l2]] paths (v1 category-only data is still read) (#116).
 *
 * Both are separate from `quizymode.guest.v1`, so "Clear guest history" (AC 3.0.17) keeps its meaning. Nothing here
 * identifies the visitor, and every read tolerates missing, corrupt, or oversized data by returning an empty value.
 * Changing devices or clearing site data resets the streak; there is no cross-device anonymous identity.
 */
export const DAILY_STORAGE_KEY = "quizymode.daily.v1";
export const INTERESTS_STORAGE_KEY = "quizymode.interests.v2";
const LEGACY_INTERESTS_STORAGE_KEY = "quizymode.interests.v1";
export const LEARNING_STATE_CHANGED_EVENT = "quizymode:learning-state-changed";
export const DAILY_MAX_COMPLETIONS = 60;
export const MAX_INTERESTS = 10;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DOCUMENT_LENGTH = 16 * 1024;

export interface LocalDailyCompletion {
  date: string;
  correct: number;
  /** Roster size, including skipped questions. */
  total: number;
  /** Questions skipped because their picture was unavailable (#403); missing in older records means 0. */
  skipped?: number;
}

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw || raw.length > MAX_DOCUMENT_LENGTH) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(LEARNING_STATE_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

export function readDailyCompletions(): LocalDailyCompletion[] {
  const doc = readJson(DAILY_STORAGE_KEY) as { version?: unknown; completions?: unknown } | null;
  if (!doc || doc.version !== 1 || !Array.isArray(doc.completions)) return [];
  const byDate = new Map<string, LocalDailyCompletion>();
  for (const entry of doc.completions.slice(0, DAILY_MAX_COMPLETIONS)) {
    if (!entry || typeof entry !== "object") continue;
    const { date, correct, total, skipped } = entry as Record<string, unknown>;
    if (typeof date !== "string" || !DATE_PATTERN.test(date) || !isCount(correct) || !isCount(total)) continue;
    if (skipped !== undefined && !isCount(skipped)) continue;
    const skippedCount = skipped ?? 0;
    if (total === 0 || correct + skippedCount > total || byDate.has(date)) continue;
    byDate.set(date, skippedCount > 0 ? { date, correct, total, skipped: skippedCount } : { date, correct, total });
  }
  return [...byDate.values()];
}

/** Records the first completion for a date; later completions of the same date keep the first score. */
export function recordLocalDailyCompletion(completion: LocalDailyCompletion): LocalDailyCompletion[] {
  const existing = readDailyCompletions();
  if (existing.some((entry) => entry.date === completion.date)) return existing;
  const next = [completion, ...existing].sort((a, b) => b.date.localeCompare(a.date)).slice(0, DAILY_MAX_COMPLETIONS);
  writeJson(DAILY_STORAGE_KEY, { version: 1, completions: next });
  return next;
}

function addDays(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

/** Consecutive UTC days with a completion, ending today or (when today is not done yet) yesterday. Same rule as the API. */
export function computeStreak(dates: Iterable<string>, today: string): number {
  const days = new Set(dates);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function readLocalInterests(): string[] {
  // A corrupt v2 document must not resurrect an older, broader v1 selection.
  let currentExists: boolean;
  try { currentExists = window.localStorage.getItem(INTERESTS_STORAGE_KEY) !== null; } catch { return []; }
  const current = readJson(INTERESTS_STORAGE_KEY) as { version?: unknown; categories?: unknown } | null;
  const legacy = !currentExists ? readJson(LEGACY_INTERESTS_STORAGE_KEY) as { version?: unknown; categories?: unknown } | null : null;
  const doc = current ?? legacy;
  if (!doc || doc.version !== (current ? 2 : 1) || !Array.isArray(doc.categories)) return [];
  const paths = doc.categories.filter((value): value is string => isTopicPath(value) && (current !== null || !value.includes("/")));
  return mergeTopics([], paths, MAX_INTERESTS);
}

export function writeLocalInterests(categories: string[]): boolean {
  const clean = mergeTopics([], categories.filter(isTopicPath), MAX_INTERESTS);
  if (!writeJson(INTERESTS_STORAGE_KEY, { version: 2, categories: clean })) return false;
  try { window.localStorage.removeItem(LEGACY_INTERESTS_STORAGE_KEY); } catch { /* The v2 document still takes precedence. */ }
  return true;
}

export function clearLocalInterests(): void {
  // Keep an empty v2 tombstone: if removing legacy storage fails, a broad v1 choice must never reappear.
  if (!writeJson(INTERESTS_STORAGE_KEY, { version: 2, categories: [] })) return;
  try {
    window.localStorage.removeItem(LEGACY_INTERESTS_STORAGE_KEY);
  } catch {
    // The empty v2 document already takes precedence.
  }
}
