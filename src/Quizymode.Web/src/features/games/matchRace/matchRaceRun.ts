import { seededShuffle } from "@/features/items/learn/learnRun";

export const MATCH_RACE_PENALTY_MS = 1000;

export type MatchRaceStatus = "ready" | "playing" | "finished";
export type MatchRaceTileKind = "question" | "answer";

export interface MatchRaceSelection {
  kind: MatchRaceTileKind;
  itemId: string;
}

export interface MatchRaceRunState {
  runId: string;
  pairCount: number;
  itemIds: string[];
  /** Item ids in the order their questions are shown. */
  questionOrder: string[];
  /** Item ids in the order their answers are shown. */
  answerOrder: string[];
  selected: MatchRaceSelection | null;
  clearedItemIds: string[];
  /** The last mismatched pair, shown as wrong until it times out or the next tap. */
  wrongPair: { questionItemId: string; answerItemId: string } | null;
  /** Items whose question was part of a miss, so first-try score = pairCount - missed. */
  missedItemIds: string[];
  mistakes: number;
  penaltyMs: number;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  status: MatchRaceStatus;
}

export type MatchRaceAction =
  | { type: "select"; kind: MatchRaceTileKind; itemId: string; nowMs: number }
  | { type: "clear-wrong" };

/** Picks `pairCount` items and shuffles questions and answers independently; the same run id gives the same board. */
export function createMatchRaceRun(poolIds: readonly string[], pairCount: number, runId: string): MatchRaceRunState {
  const itemIds: string[] = seededShuffle(poolIds, `${runId}:pick`).slice(0, pairCount);
  return {
    runId,
    pairCount: itemIds.length,
    itemIds,
    questionOrder: seededShuffle(itemIds, `${runId}:q`),
    answerOrder: seededShuffle(itemIds, `${runId}:a`),
    selected: null,
    clearedItemIds: [],
    wrongPair: null,
    missedItemIds: [],
    mistakes: 0,
    penaltyMs: 0,
    startedAtMs: null,
    finishedAtMs: null,
    status: "ready",
  };
}

export function reduceMatchRaceRun(state: MatchRaceRunState, action: MatchRaceAction): MatchRaceRunState {
  if (action.type === "clear-wrong") {
    return state.wrongPair ? { ...state, wrongPair: null } : state;
  }

  const { kind, itemId, nowMs } = action;
  if (state.status === "finished" || state.clearedItemIds.includes(itemId) || !state.itemIds.includes(itemId)) {
    return state;
  }

  // The first selection starts the clock; any tap ends a lingering wrong state.
  const base: MatchRaceRunState = {
    ...state,
    wrongPair: null,
    startedAtMs: state.startedAtMs ?? nowMs,
    status: "playing",
  };

  const selected: MatchRaceSelection | null = state.selected;
  if (!selected) return { ...base, selected: { kind, itemId } };
  if (selected.kind === kind) {
    return { ...base, selected: selected.itemId === itemId ? null : { kind, itemId } };
  }

  const questionItemId: string = kind === "question" ? itemId : selected.itemId;
  const answerItemId: string = kind === "answer" ? itemId : selected.itemId;

  if (questionItemId === answerItemId) {
    const clearedItemIds: string[] = [...state.clearedItemIds, questionItemId];
    const finished: boolean = clearedItemIds.length === state.pairCount;
    return {
      ...base,
      selected: null,
      clearedItemIds,
      finishedAtMs: finished ? nowMs : null,
      status: finished ? "finished" : "playing",
    };
  }

  return {
    ...base,
    selected: null,
    wrongPair: { questionItemId, answerItemId },
    missedItemIds: state.missedItemIds.includes(questionItemId)
      ? state.missedItemIds
      : [...state.missedItemIds, questionItemId],
    mistakes: state.mistakes + 1,
    penaltyMs: state.penaltyMs + MATCH_RACE_PENALTY_MS,
  };
}

/** Time on the clock: from the first selection (to the last match once finished), plus 1 s per miss. */
export function getElapsedMs(state: MatchRaceRunState, nowMs: number): number {
  if (state.startedAtMs === null) return 0;
  const end: number = state.finishedAtMs ?? nowMs;
  return Math.max(0, end - state.startedAtMs) + state.penaltyMs;
}

/** Pairs matched without a miss on that pair's question. */
export function getFirstTryScore(state: MatchRaceRunState): number {
  return state.pairCount - state.missedItemIds.length;
}

/** m:ss.t, e.g. "0:12.3". */
export function formatGameTime(ms: number): string {
  const tenths: number = Math.floor(Math.max(0, ms) / 100);
  const minutes: number = Math.floor(tenths / 600);
  const seconds: number = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}
