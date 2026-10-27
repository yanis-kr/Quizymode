import type { ItemResponse } from "@/types/api";
import { seededShuffle } from "@/features/items/learn/learnRun";
import { cycleOrder } from "../deckCycle";
import {
  BUCKET_DROP_BASE_FALL_MS,
  BUCKET_DROP_LIVES,
  BUCKET_DROP_MIN_FALL_MS,
  BUCKET_DROP_SPEEDUP,
  BUCKET_DROP_SPEEDUP_EVERY,
  getGameDistractors,
} from "../gameRoster";

/** ready: the first card waits for the first input; playing: the card falls; feedback: the drop's result shows. */
export type BucketDropStatus = "ready" | "playing" | "feedback" | "finished";

export interface BucketDropItemData {
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
}

export interface BucketDropResult {
  /** 0-2, or null when the card landed before any pick. */
  pickedIndex: number | null;
  isCorrect: boolean;
}

export interface BucketDropRunState {
  runId: string;
  poolIds: string[];
  items: Record<string, BucketDropItemData>;
  order: string[];
  cycle: number;
  position: number;
  /** 1-based number of the card on screen; seeds the bucket order. */
  sequence: number;
  itemId: string;
  /** Exactly three answers: the correct one and two short distractors. */
  buckets: string[];
  lives: number;
  /** Correct answers. */
  score: number;
  answered: number;
  /** Unique, in the order first missed. */
  missedItemIds: string[];
  lastResult: BucketDropResult | null;
  status: BucketDropStatus;
}

export type BucketDropAction = { type: "pick"; index: number } | { type: "land" } | { type: "next" };

function bucketsFor(runId: string, data: BucketDropItemData, sequence: number): string[] {
  const distractors: string[] = getGameDistractors(data).slice(0, 2);
  return seededShuffle([data.correctAnswer, ...distractors], `${runId}:${sequence}`);
}

/** Milliseconds a card takes to fall: 6 s, 15% faster after every 5 correct answers, never under 2 s. */
export function getFallMs(correct: number): number {
  const steps: number = Math.floor(Math.max(0, correct) / BUCKET_DROP_SPEEDUP_EVERY);
  return Math.max(BUCKET_DROP_MIN_FALL_MS, Math.round(BUCKET_DROP_BASE_FALL_MS * BUCKET_DROP_SPEEDUP ** steps));
}

export function createBucketDropRun(items: readonly ItemResponse[], runId: string): BucketDropRunState {
  const poolIds: string[] = items.map((item) => item.id);
  const data: Record<string, BucketDropItemData> = {};
  for (const item of items) {
    data[item.id] = {
      question: item.question,
      correctAnswer: item.correctAnswer,
      incorrectAnswers: item.incorrectAnswers ?? [],
    };
  }
  const order: string[] = cycleOrder(poolIds, runId, 0, null);
  return {
    runId,
    poolIds,
    items: data,
    order,
    cycle: 0,
    position: 0,
    sequence: 1,
    itemId: order[0],
    buckets: bucketsFor(runId, data[order[0]], 1),
    lives: BUCKET_DROP_LIVES,
    score: 0,
    answered: 0,
    missedItemIds: [],
    lastResult: null,
    status: "ready",
  };
}

function resolve(state: BucketDropRunState, pickedIndex: number | null, isCorrect: boolean): BucketDropRunState {
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

export function reduceBucketDropRun(state: BucketDropRunState, action: BucketDropAction): BucketDropRunState {
  if (action.type === "pick") {
    if (state.status !== "ready" && state.status !== "playing") return state;
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= state.buckets.length) return state;
    // Same identity check as the quiz: the bucket text is the raw correct answer.
    return resolve(state, action.index, state.buckets[action.index] === state.items[state.itemId].correctAnswer);
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
  const sequence: number = state.sequence + 1;
  const itemId: string = order[position];
  return {
    ...state,
    order,
    cycle,
    position,
    sequence,
    itemId,
    buckets: bucketsFor(state.runId, state.items[itemId], sequence),
    lastResult: null,
    status: "playing",
  };
}
