export const GAME_BEST_STORAGE_KEY = "quizymode.games.best.v1";
const MAX_ENTRIES = 100;

/** Used when localStorage is unavailable, so a best still holds for the page's lifetime. */
let memoryBests: Record<string, number> = {};

export function matchRaceBestKey(scopeKey: string, pairCount: number): string {
  return `match-race|${scopeKey}|pairs=${pairCount}`;
}

function readAll(): Record<string, number> {
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

/** Best time in ms for this scope and pair count, or null. Never throws. */
export function readBest(scopeKey: string, pairCount: number): number | null {
  return readAll()[matchRaceBestKey(scopeKey, pairCount)] ?? null;
}

/** Best time for the scope at any pair count, preferring `preferredPairCount`. Never throws. */
export function readBestForScope(scopeKey: string, preferredPairCount: number): number | null {
  const all: Record<string, number> = readAll();
  const preferred: number | undefined = all[matchRaceBestKey(scopeKey, preferredPairCount)];
  if (preferred !== undefined) return preferred;
  const prefix = `match-race|${scopeKey}|pairs=`;
  const times: number[] = Object.entries(all)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value);
  return times.length > 0 ? Math.min(...times) : null;
}

export interface WriteBestResult {
  /** The best time after this run, in ms. */
  best: number;
  /** True for a first run or a time faster than the stored best. */
  isNewBest: boolean;
  /** False when the browser refused the write; the best still holds in memory. */
  saved: boolean;
}

/** Stores `elapsedMs` when it beats the stored best (a first run always does). Never throws. */
export function writeBestIfFaster(scopeKey: string, pairCount: number, elapsedMs: number): WriteBestResult {
  const key: string = matchRaceBestKey(scopeKey, pairCount);
  const all: Record<string, number> = readAll();
  const previous: number | undefined = all[key];
  if (previous !== undefined && elapsedMs >= previous) {
    return { best: previous, isNewBest: false, saved: true };
  }

  // Re-insert so the key becomes the newest entry, then drop the oldest beyond the cap.
  delete all[key];
  all[key] = elapsedMs;
  const keys: string[] = Object.keys(all);
  for (const oldest of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete all[oldest];

  memoryBests = all;
  try {
    window.localStorage.setItem(GAME_BEST_STORAGE_KEY, JSON.stringify(all));
    return { best: elapsedMs, isNewBest: true, saved: true };
  } catch {
    return { best: elapsedMs, isNewBest: true, saved: false };
  }
}

/** Test-only: clears the in-memory fallback. */
export function resetMatchRaceBestForTests(): void {
  memoryBests = {};
}
