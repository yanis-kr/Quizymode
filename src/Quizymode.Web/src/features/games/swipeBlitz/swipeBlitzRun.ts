import { seededShuffle } from "@/features/items/learn/learnRun";
import type { ItemResponse } from "@/types/api";
import { cycleOrder } from "../deckCycle";
import { SWIPE_BLITZ_ROUND_MS, getGameDistractors } from "../gameRoster";

export type SwipeBlitzStatus = "ready" | "playing" | "finished";
export type SwipeChoice = "correct" | "wrong";

export interface SwipeCard {
  itemId: string;
  /** The correct answer, or one short distractor. */
  shownAnswer: string;
  /** True when `shownAnswer` is the correct answer. */
  isTrue: boolean;
}

interface SwipeItemData {
  correctAnswer: string;
  distractors: string[];
}

export interface SwipeBlitzRunState {
  runId: string;
  poolIds: string[];
  items: Record<string, SwipeItemData>;
  order: string[];
  cycle: number;
  position: number;
  /** 1-based number of the card on screen; seeds the truth and distractor choice. */
  sequence: number;
  card: SwipeCard;
  score: number;
  decisions: number;
  /** Unique, in the order first missed. */
  missedItemIds: string[];
  /** Set for a miss until it times out; input is ignored meanwhile. */
  reveal: { itemId: string } | null;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  status: SwipeBlitzStatus;
}

export type SwipeBlitzAction =
  | { type: "decide"; choice: SwipeChoice; nowMs: number }
  | { type: "end-reveal" }
  | { type: "time-up"; nowMs: number };

function buildCard(state: Pick<SwipeBlitzRunState, "runId" | "items">, itemId: string, sequence: number): SwipeCard {
  const data: SwipeItemData = state.items[itemId];
  const isTrue: boolean = seededShuffle([true, false], `${state.runId}:${sequence}:truth`)[0];
  const shownAnswer: string = isTrue
    ? data.correctAnswer
    : seededShuffle(data.distractors, `${state.runId}:${sequence}:d`)[0];
  return { itemId, shownAnswer, isTrue };
}

/** Starts a run over `items` (each must have a short distractor; see isGameEligible). */
export function createSwipeBlitzRun(items: readonly ItemResponse[], runId: string): SwipeBlitzRunState {
  const poolIds: string[] = items.map((item) => item.id);
  const data: Record<string, SwipeItemData> = {};
  for (const item of items) data[item.id] = { correctAnswer: item.correctAnswer, distractors: getGameDistractors(item) };
  const order: string[] = cycleOrder(poolIds, runId, 0, null);
  return {
    runId,
    poolIds,
    items: data,
    order,
    cycle: 0,
    position: 0,
    sequence: 1,
    card: buildCard({ runId, items: data }, order[0], 1),
    score: 0,
    decisions: 0,
    missedItemIds: [],
    reveal: null,
    startedAtMs: null,
    finishedAtMs: null,
    status: "ready",
  };
}

function advance(state: SwipeBlitzRunState): SwipeBlitzRunState {
  let { order, cycle, position } = state;
  position += 1;
  if (position >= order.length) {
    cycle += 1;
    order = cycleOrder(state.poolIds, state.runId, cycle, order[order.length - 1] ?? null);
    position = 0;
  }
  const sequence: number = state.sequence + 1;
  return { ...state, order, cycle, position, sequence, card: buildCard(state, order[position], sequence) };
}

function finish(state: SwipeBlitzRunState, startedAtMs: number): SwipeBlitzRunState {
  return {
    ...state,
    startedAtMs,
    finishedAtMs: startedAtMs + SWIPE_BLITZ_ROUND_MS,
    reveal: null,
    status: "finished",
  };
}

export function reduceSwipeBlitzRun(state: SwipeBlitzRunState, action: SwipeBlitzAction): SwipeBlitzRunState {
  if (state.status === "finished") return state;

  if (action.type === "end-reveal") {
    return state.reveal ? advance({ ...state, reveal: null }) : state;
  }

  if (action.type === "time-up") {
    if (state.startedAtMs === null || action.nowMs < state.startedAtMs + SWIPE_BLITZ_ROUND_MS) return state;
    return finish(state, state.startedAtMs);
  }

  if (state.reveal) return state;
  const startedAtMs: number = state.startedAtMs ?? action.nowMs;
  // A decision at or after the deadline ends the round and does not count.
  if (action.nowMs >= startedAtMs + SWIPE_BLITZ_ROUND_MS) return finish(state, startedAtMs);

  const started: SwipeBlitzRunState = { ...state, startedAtMs, status: "playing" };
  const isRight: boolean = (action.choice === "correct") === state.card.isTrue;
  if (isRight) return advance({ ...started, score: state.score + 1, decisions: state.decisions + 1 });

  const itemId: string = state.card.itemId;
  return {
    ...started,
    decisions: state.decisions + 1,
    missedItemIds: state.missedItemIds.includes(itemId) ? state.missedItemIds : [...state.missedItemIds, itemId],
    reveal: { itemId },
  };
}

/** Milliseconds left in the round; the full round before the first decision. */
export function getRemainingMs(state: SwipeBlitzRunState, nowMs: number): number {
  if (state.startedAtMs === null) return SWIPE_BLITZ_ROUND_MS;
  return Math.max(0, Math.min(SWIPE_BLITZ_ROUND_MS, state.startedAtMs + SWIPE_BLITZ_ROUND_MS - nowMs));
}

/** "0:42" with whole seconds rounded up, so the display reads 0:00 only when time is out. */
export function formatCountdown(remainingMs: number): string {
  const seconds: number = Math.ceil(Math.max(0, remainingMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
