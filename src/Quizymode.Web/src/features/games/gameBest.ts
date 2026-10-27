export const GAME_BEST_STORAGE_KEY = "quizymode.games.best.v1";
const MAX_ENTRIES = 100;

/** Used when localStorage is unavailable, so a best still holds for the page's lifetime. */
let memoryBests: Record<string, number> = {};

export function swipeBlitzBestKey(scopeKey: string): string {
  return `swipe-blitz|${scopeKey}`;
}

export function survivalBestKey(scopeKey: string): string {
  return `survival|${scopeKey}`;
}

export function bucketDropBestKey(scopeKey: string): string {
  return `bucket-drop|${scopeKey}`;
}

/** Every stored best (storage merged over the in-memory fallback). Never throws. */
export function readAllGameBests(): Record<string, number> {
  try {
    const raw: string | null = window.localStorage.getItem(GAME_BEST_STORAGE_KEY);
    if (!raw) return { ...memoryBests };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...memoryBests };
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) result[key] = value;
    }
    return { ...memoryBests, ...result };
  } catch {
    return { ...memoryBests };
  }
}

export function readGameBest(key: string): number | null {
  return readAllGameBests()[key] ?? null;
}

/**
 * Stores `value` under `key` as the newest entry and drops the oldest beyond the cap (shared by every game).
 * Returns false when the browser refused the write; the value still holds in memory. Never throws.
 */
export function persistGameBest(key: string, value: number): boolean {
  const all: Record<string, number> = readAllGameBests();
  // Re-insert so the key becomes the newest entry.
  delete all[key];
  all[key] = value;
  const keys: string[] = Object.keys(all);
  for (const oldest of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete all[oldest];

  memoryBests = all;
  try {
    window.localStorage.setItem(GAME_BEST_STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export interface WriteHigherBestResult {
  /** The best after this run; 0 when nothing is stored. */
  best: number;
  /** True only for a positive value above the stored best (or any positive first value). */
  isNewBest: boolean;
  saved: boolean;
}

/** Higher is better (scores, streaks). Values of 0 or less are never stored and never a new best. Never throws. */
export function writeBestIfHigher(key: string, value: number): WriteHigherBestResult {
  const previous: number | null = readGameBest(key);
  if (!Number.isFinite(value) || value <= 0 || (previous !== null && value <= previous)) {
    return { best: previous ?? 0, isNewBest: false, saved: true };
  }
  const saved: boolean = persistGameBest(key, value);
  return { best: value, isNewBest: true, saved };
}

/** Test-only: clears the in-memory fallback. */
export function resetGameBestForTests(): void {
  memoryBests = {};
}
