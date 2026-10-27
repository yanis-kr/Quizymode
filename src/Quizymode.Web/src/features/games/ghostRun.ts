export const GHOST_STORAGE_KEY = "quizymode.games.ghost.v1";
const MAX_ENTRIES = 20;
export const MAX_GHOST_MARKS = 300;

interface GhostEntry {
  v: 1;
  savedAt: number;
  /** Elapsed milliseconds at each unit of progress (a matched pair, a correct Survival answer), ascending. */
  marks: number[];
}

/** Used when localStorage is unavailable, so a ghost still holds for the page's lifetime. */
let memoryGhosts: Record<string, GhostEntry> = {};

export function matchRaceGhostKey(scopeKey: string, pairCount: number): string {
  return `match-race|${scopeKey}|${pairCount}`;
}

export function survivalGhostKey(scopeKey: string): string {
  return `survival|${scopeKey}`;
}

function cleanMarks(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const marks: number[] = [];
  for (const mark of value.slice(0, MAX_GHOST_MARKS)) {
    if (typeof mark !== "number" || !Number.isFinite(mark) || mark < 0) return null;
    if (marks.length > 0 && mark < marks[marks.length - 1]) return null;
    marks.push(mark);
  }
  return marks;
}

function readAll(): Record<string, GhostEntry> {
  try {
    const raw: string | null = window.localStorage.getItem(GHOST_STORAGE_KEY);
    if (!raw) return { ...memoryGhosts };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...memoryGhosts };
    const result: Record<string, GhostEntry> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = value as Partial<GhostEntry> | null;
      const marks: number[] | null = entry && entry.v === 1 ? cleanMarks(entry.marks) : null;
      if (marks) result[key] = { v: 1, savedAt: typeof entry?.savedAt === "number" ? entry.savedAt : 0, marks };
    }
    return { ...memoryGhosts, ...result };
  } catch {
    return { ...memoryGhosts };
  }
}

/** The stored ghost marks for a key, or null. Never throws. */
export function readGhost(key: string): number[] | null {
  return readAll()[key]?.marks ?? null;
}

function persist(key: string, marks: number[]): void {
  const all: Record<string, GhostEntry> = readAll();
  delete all[key];
  all[key] = { v: 1, savedAt: Date.now(), marks: marks.slice(0, MAX_GHOST_MARKS) };
  const keys: string[] = Object.keys(all);
  for (const oldest of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete all[oldest];
  memoryGhosts = all;
  try {
    window.localStorage.setItem(GHOST_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // The ghost still holds in memory for this page; a failed write is silent.
  }
}

/** Units of progress the ghost had made by `elapsedMs` (marks at or before it). */
export function ghostProgressAt(marks: readonly number[], elapsedMs: number): number {
  let low = 0;
  let high: number = marks.length;
  while (low < high) {
    const middle: number = (low + high) >>> 1;
    if (marks[middle] <= elapsedMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Match Race: faster final time (the last mark) replaces the ghost. */
export function compareMatchRaceToGhost(ghostMarks: readonly number[], finalMs: number): number {
  return ghostMarks[ghostMarks.length - 1] - finalMs;
}

/** Survival: more correct answers at the end of the run, compared with the ghost at the same moment. */
export function compareSurvivalToGhost(ghostMarks: readonly number[], correct: number, endMs: number): number {
  return correct - ghostProgressAt(ghostMarks, endMs);
}

/** Match Race: stores `marks` when there is no ghost or the final time is faster. Returns true when stored. */
export function writeMatchRaceGhostIfBetter(key: string, marks: readonly number[]): boolean {
  if (marks.length === 0) return false;
  const previous: number[] | null = readGhost(key);
  if (previous && previous[previous.length - 1] <= marks[marks.length - 1]) return false;
  persist(key, [...marks]);
  return true;
}

/** Survival: stores `marks` when there is no ghost, more answers were right, or the same count came faster. */
export function writeSurvivalGhostIfBetter(key: string, marks: readonly number[]): boolean {
  if (marks.length === 0) return false;
  const previous: number[] | null = readGhost(key);
  if (previous) {
    if (marks.length < previous.length) return false;
    if (marks.length === previous.length && marks[marks.length - 1] >= previous[previous.length - 1]) return false;
  }
  persist(key, [...marks]);
  return true;
}

export type GhostTone = "ahead" | "behind" | "level" | "first";

export interface GhostLine {
  text: string;
  tone: GhostTone;
}

const FIRST_RUN_TEXT = "First run: this is your ghost now.";

/** m:ss for whole seconds, e.g. "0:42". */
function formatSeconds(ms: number): string {
  const total: number = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Finish line for Match Race; `deltaMs` is ghost time minus yours (positive = ahead), null without a ghost. */
export function describeMatchRaceGhost(deltaMs: number | null): GhostLine {
  if (deltaMs === null) return { text: FIRST_RUN_TEXT, tone: "first" };
  const tenths: number = Math.round(Math.abs(deltaMs) / 100);
  if (tenths === 0) return { text: "Level with your ghost.", tone: "level" };
  const seconds: string = (tenths / 10).toFixed(1);
  return deltaMs > 0
    ? { text: `${seconds} s ahead of your ghost.`, tone: "ahead" }
    : { text: `${seconds} s behind your ghost.`, tone: "behind" };
}

/** Finish line for Survival; `delta` is your correct answers minus the ghost's at `endMs`, null without a ghost. */
export function describeSurvivalGhost(delta: number | null, endMs: number): GhostLine {
  if (delta === null) return { text: FIRST_RUN_TEXT, tone: "first" };
  const at: string = formatSeconds(endMs);
  if (delta === 0) return { text: `Level with your ghost at ${at}.`, tone: "level" };
  const count: number = Math.abs(delta);
  const noun: string = count === 1 ? "answer" : "answers";
  return delta > 0
    ? { text: `${count} ${noun} ahead of your ghost at ${at}.`, tone: "ahead" }
    : { text: `${count} ${noun} behind your ghost at ${at}.`, tone: "behind" };
}

/** Test-only: clears the in-memory fallback. */
export function resetGhostForTests(): void {
  memoryGhosts = {};
}
