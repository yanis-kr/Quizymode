/**
 * #677: browser-local results of daily archive runs for anonymous visitors. Kept apart from `quizymode.daily.v1` so an
 * archive run can never touch the streak. Reads tolerate missing or corrupt data by returning an empty list.
 */
export const ARCHIVE_STORAGE_KEY = "quizymode.daily-archive.v1";
const MAX_RESULTS = 30;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface LocalArchiveResult {
  date: string;
  correct: number;
  total: number;
}

export function readArchiveResults(): LocalArchiveResult[] {
  try {
    const raw = window.localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw || raw.length > 8 * 1024) return [];
    const doc = JSON.parse(raw) as { version?: unknown; results?: unknown };
    if (doc.version !== 1 || !Array.isArray(doc.results)) return [];
    const byDate = new Map<string, LocalArchiveResult>();
    for (const entry of doc.results.slice(0, MAX_RESULTS)) {
      const { date, correct, total } = (entry ?? {}) as Record<string, unknown>;
      if (typeof date !== "string" || !DATE_PATTERN.test(date) || byDate.has(date)) continue;
      if (!Number.isInteger(correct) || !Number.isInteger(total) || (total as number) < 1) continue;
      byDate.set(date, { date, correct: correct as number, total: total as number });
    }
    return [...byDate.values()];
  } catch {
    return [];
  }
}

/** Keeps the first score per date, like the daily quiz. */
export function recordArchiveResult(result: LocalArchiveResult): void {
  const existing = readArchiveResults();
  if (existing.some((entry) => entry.date === result.date)) return;
  const next = [result, ...existing].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_RESULTS);
  try {
    window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify({ version: 1, results: next }));
  } catch {
    // Storage unavailable: the run still works, it is just not remembered.
  }
}
