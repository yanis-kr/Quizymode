import type { ItemResponse } from "@/types/api";
import { cycleOrder } from "../deckCycle";
import { SURVIVAL_HEARTS, getGameOptions } from "../gameRoster";

export type SurvivalStatus = "ready" | "playing" | "feedback" | "finished";

export interface SurvivalItemData {
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
}

export interface SurvivalRunState {
  runId: string;
  poolIds: string[];
  items: Record<string, SurvivalItemData>;
  order: string[];
  cycle: number;
  position: number;
  /** 1-based number of the question on screen; seeds the option order. */
  sequence: number;
  itemId: string;
  options: string[];
  hearts: number;
  streak: number;
  longestStreak: number;
  correct: number;
  answered: number;
  /** Unique, in the order first missed. */
  missedItemIds: string[];
  lastAnswer: { option: string; isCorrect: boolean } | null;
  status: SurvivalStatus;
}

export type SurvivalAction = { type: "answer"; option: string } | { type: "next" };

function optionsFor(state: Pick<SurvivalRunState, "runId" | "items">, itemId: string, sequence: number): string[] {
  return getGameOptions(state.items[itemId], `${state.runId}:${sequence}`);
}

export function createSurvivalRun(items: readonly ItemResponse[], runId: string): SurvivalRunState {
  const poolIds: string[] = items.map((item) => item.id);
  const data: Record<string, SurvivalItemData> = {};
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
    options: optionsFor({ runId, items: data }, order[0], 1),
    hearts: SURVIVAL_HEARTS,
    streak: 0,
    longestStreak: 0,
    correct: 0,
    answered: 0,
    missedItemIds: [],
    lastAnswer: null,
    status: "ready",
  };
}

export function reduceSurvivalRun(state: SurvivalRunState, action: SurvivalAction): SurvivalRunState {
  if (action.type === "answer") {
    if (state.status !== "ready" && state.status !== "playing") return state;
    if (!state.options.includes(action.option)) return state;
    // Same identity check as the quiz: the raw correct answer is what the option list holds.
    const isCorrect: boolean = action.option === state.items[state.itemId].correctAnswer;
    const streak: number = isCorrect ? state.streak + 1 : 0;
    return {
      ...state,
      hearts: isCorrect ? state.hearts : state.hearts - 1,
      streak,
      longestStreak: Math.max(state.longestStreak, streak),
      correct: state.correct + (isCorrect ? 1 : 0),
      answered: state.answered + 1,
      missedItemIds:
        isCorrect || state.missedItemIds.includes(state.itemId)
          ? state.missedItemIds
          : [...state.missedItemIds, state.itemId],
      lastAnswer: { option: action.option, isCorrect },
      status: "feedback",
    };
  }

  if (state.status !== "feedback") return state;
  if (state.hearts <= 0) return { ...state, status: "finished" };
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
    options: optionsFor(state, itemId, sequence),
    lastAnswer: null,
    status: "playing",
  };
}
