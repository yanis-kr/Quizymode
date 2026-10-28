import { seededShuffle } from "@/features/items/learn/learnRun";
import { cycleOrder } from "../deckCycle";
import { BUCKET_DROP_LIVES } from "../gameRoster";
import { pickSortItGroups, type SortItGroup } from "./sortItPool";

/** ready: the first card waits for the first input; playing: the card falls; feedback: the drop result shows. */
export type SortItStatus = "ready" | "playing" | "feedback" | "finished";

export interface SortItItemData {
  /** The short answer text that falls. */
  fact: string;
  /** Index into the buckets of the run. */
  bucketIndex: number;
}

export interface SortItResult {
  /** Bucket index, or null when the card landed before any pick. */
  pickedIndex: number | null;
  isCorrect: boolean;
}

export interface SortItRunState {
  runId: string;
  poolIds: string[];
  items: Record<string, SortItItemData>;
  /** Group labels in their fixed on-screen order for the whole run. */
  buckets: string[];
  order: string[];
  cycle: number;
  position: number;
  sequence: number;
  itemId: string;
  lives: number;
  score: number;
  answered: number;
  missedItemIds: string[];
  lastResult: SortItResult | null;
  status: SortItStatus;
}

export type SortItAction = { type: "pick"; index: number } | { type: "land" } | { type: "next" };

/** Starts a run over at most 4 of the qualifying groups; bucket order is shuffled once from the run id. */
export function createSortItRun(groups: readonly SortItGroup[], runId: string): SortItRunState {
  const picked: SortItGroup[] = seededShuffle(pickSortItGroups(groups, runId), `${runId}:buckets`);
  const items: Record<string, SortItItemData> = {};
  const poolIds: string[] = [];
  picked.forEach((group, bucketIndex) => {
    for (const item of group.items) {
      items[item.id] = { fact: item.correctAnswer.trim(), bucketIndex };
      poolIds.push(item.id);
    }
  });
  const order: string[] = cycleOrder(poolIds, runId, 0, null);
  return {
    runId,
    poolIds,
    items,
    buckets: picked.map((group) => group.label),
    order,
    cycle: 0,
    position: 0,
    sequence: 1,
    itemId: order[0],
    lives: BUCKET_DROP_LIVES,
    score: 0,
    answered: 0,
    missedItemIds: [],
    lastResult: null,
    status: "ready",
  };
}

function resolve(state: SortItRunState, pickedIndex: number | null, isCorrect: boolean): SortItRunState {
  return {
    ...state,
    lives: isCorrect ? state.lives : state.lives - 1,
    score: state.score + (isCorrect ? 1 : 0),
    answered: state.answered + 1,
    missedItemIds:
      isCorrect || state.missedItemIds.includes(state.itemId)
        ? state.missedItemIds
        : [...state.missedItemIds, state.itemId],
    lastResult: { pickedIndex, isCorrect },
    status: "feedback",
  };
}

export function reduceSortItRun(state: SortItRunState, action: SortItAction): SortItRunState {
  if (action.type === "pick") {
    if (state.status !== "ready" && state.status !== "playing") return state;
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= state.buckets.length) return state;
    return resolve(state, action.index, action.index === state.items[state.itemId].bucketIndex);
  }

  if (action.type === "land") {
    // The first card never falls, so it cannot land.
    return state.status === "playing" ? resolve(state, null, false) : state;
  }

  if (state.status !== "feedback") return state;
  if (state.lives <= 0) return { ...state, status: "finished" };
  let { order, cycle, position } = state;
  position += 1;
  if (position >= order.length) {
    cycle += 1;
    order = cycleOrder(state.poolIds, state.runId, cycle, order[order.length - 1] ?? null);
    position = 0;
  }
  return {
    ...state,
    order,
    cycle,
    position,
    sequence: state.sequence + 1,
    itemId: order[position],
    lastResult: null,
    status: "playing",
  };
}
