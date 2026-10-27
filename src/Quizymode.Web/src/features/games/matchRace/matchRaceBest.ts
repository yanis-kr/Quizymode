import { GAME_BEST_STORAGE_KEY, persistGameBest, readAllGameBests, resetGameBestForTests } from "../gameBest";

export { GAME_BEST_STORAGE_KEY };

export function matchRaceBestKey(scopeKey: string, pairCount: number): string {
  return `match-race|${scopeKey}|pairs=${pairCount}`;
}

/** Best time in ms for this scope and pair count, or null. Never throws. */
export function readBest(scopeKey: string, pairCount: number): number | null {
  return readAllGameBests()[matchRaceBestKey(scopeKey, pairCount)] ?? null;
}

/** Best time for the scope at any pair count, preferring `preferredPairCount`. Never throws. */
export function readBestForScope(scopeKey: string, preferredPairCount: number): number | null {
  const all: Record<string, number> = readAllGameBests();
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
  const all: Record<string, number> = readAllGameBests();
  const previous: number | undefined = all[key];
  if (previous !== undefined && elapsedMs >= previous) {
    return { best: previous, isNewBest: false, saved: true };
  }

  const saved: boolean = persistGameBest(key, elapsedMs);
  return { best: elapsedMs, isNewBest: true, saved };
}

/** Test-only: clears the in-memory fallback. */
export function resetMatchRaceBestForTests(): void {
  resetGameBestForTests();
}
