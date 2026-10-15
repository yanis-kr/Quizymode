import type { ItemResponse } from "@/types/api";

export const QUIZ_RUN_SCHEMA_VERSION = 1;
export const QUIZ_COMPLETED_EVENT = "quizymode:quiz-completed";

export type QuizRunView = "active" | "summary" | "review";

export type QuizRunScope =
  | { kind: "collection"; collectionId: string }
  | {
      kind: "category" | "global";
      category: string | null;
      navigationKeywords: string[];
      filterKeywords: string[];
      quizSize: number;
    };

export interface QuizAnswerOutcome {
  itemId: string;
  selectedAnswer: string;
  isCorrect: boolean;
}

export interface QuizRunState {
  schemaVersion: typeof QUIZ_RUN_SCHEMA_VERSION;
  runId: string;
  identityKey: string;
  scope: QuizRunScope;
  itemIds: string[];
  outcomes: Record<string, QuizAnswerOutcome>;
  view: QuizRunView;
  completedAt: string | null;
  completionEmitted: boolean;
}

export interface QuizRunSummary {
  answered: number;
  correct: number;
  total: number;
  missedItemIds: string[];
  percentage: number;
  isComplete: boolean;
}

export interface QuizCompletionSnapshot {
  readonly runId: string;
  readonly scope: QuizRunScope;
  readonly completedAt: string;
  readonly correct: number;
  readonly total: number;
  readonly missedItemIds: readonly string[];
}

export type QuizRunAction =
  | { type: "answer"; itemId: string; selectedAnswer: string; isCorrect: boolean; completedAt: string }
  | { type: "show-summary" }
  | { type: "review-mistakes" }
  | { type: "mark-completion-emitted" };

function newRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function uniqueItemIds(items: Pick<ItemResponse, "id">[]): string[] {
  return Array.from(new Set(items.map((item) => item.id).filter(Boolean)));
}

export function createQuizRun(
  scope: QuizRunScope,
  itemIds: string[],
  identityKey: string,
): QuizRunState {
  return {
    schemaVersion: QUIZ_RUN_SCHEMA_VERSION,
    runId: newRunId(),
    identityKey,
    scope,
    itemIds: Array.from(new Set(itemIds.filter(Boolean))),
    outcomes: {},
    view: "active",
    completedAt: null,
    completionEmitted: false,
  };
}

export function summarizeQuizRun(run: QuizRunState): QuizRunSummary {
  const outcomes = run.itemIds
    .map((itemId) => run.outcomes[itemId])
    .filter((outcome): outcome is QuizAnswerOutcome => Boolean(outcome));
  const correct = outcomes.filter((outcome) => outcome.isCorrect).length;
  const total = run.itemIds.length;

  return {
    answered: outcomes.length,
    correct,
    total,
    missedItemIds: outcomes.filter((outcome) => !outcome.isCorrect).map((outcome) => outcome.itemId),
    percentage: total === 0 ? 0 : Math.round((correct / total) * 100),
    isComplete: total > 0 && outcomes.length === total,
  };
}

export function reduceQuizRun(run: QuizRunState, action: QuizRunAction): QuizRunState {
  if (action.type === "answer") {
    if (!run.itemIds.includes(action.itemId) || run.outcomes[action.itemId]) {
      return run;
    }

    const outcomes = {
      ...run.outcomes,
      [action.itemId]: {
        itemId: action.itemId,
        selectedAnswer: action.selectedAnswer,
        isCorrect: action.isCorrect,
      },
    };
    const isComplete = run.itemIds.every((itemId) => Boolean(outcomes[itemId]));

    return {
      ...run,
      outcomes,
      completedAt: isComplete ? action.completedAt : null,
    };
  }

  if (action.type === "show-summary") {
    return summarizeQuizRun(run).isComplete ? { ...run, view: "summary" } : run;
  }

  if (action.type === "review-mistakes") {
    return summarizeQuizRun(run).missedItemIds.length > 0 ? { ...run, view: "review" } : run;
  }

  return run.completionEmitted ? run : { ...run, completionEmitted: true };
}

function sameStringArray(left: unknown, right: string[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

export function sameQuizScope(left: unknown, right: QuizRunScope): boolean {
  if (!left || typeof left !== "object") return false;
  const candidate = left as Partial<QuizRunScope>;
  if (candidate.kind !== right.kind) return false;
  if (right.kind === "collection") {
    return "collectionId" in candidate && candidate.collectionId === right.collectionId;
  }

  return (
    "category" in candidate &&
    candidate.category === right.category &&
    "quizSize" in candidate &&
    candidate.quizSize === right.quizSize &&
    "navigationKeywords" in candidate &&
    sameStringArray(candidate.navigationKeywords, right.navigationKeywords) &&
    "filterKeywords" in candidate &&
    sameStringArray(candidate.filterKeywords, right.filterKeywords)
  );
}

export function restoreQuizRun(
  value: unknown,
  expectedScope: QuizRunScope,
  expectedItemIds: string[],
  identityKey: string,
): QuizRunState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<QuizRunState>;
  if (
    candidate.schemaVersion !== QUIZ_RUN_SCHEMA_VERSION ||
    typeof candidate.runId !== "string" ||
    candidate.runId.length === 0 ||
    candidate.runId.length > 128 ||
    candidate.identityKey !== identityKey ||
    !sameQuizScope(candidate.scope, expectedScope) ||
    !sameStringArray(candidate.itemIds, expectedItemIds) ||
    !candidate.outcomes ||
    typeof candidate.outcomes !== "object" ||
    !["active", "summary", "review"].includes(candidate.view ?? "") ||
    typeof candidate.completionEmitted !== "boolean"
  ) {
    return null;
  }

  const outcomes: Record<string, QuizAnswerOutcome> = {};
  if (Object.keys(candidate.outcomes).some((itemId) => !expectedItemIds.includes(itemId))) {
    return null;
  }
  for (const itemId of expectedItemIds) {
    const outcome = candidate.outcomes[itemId];
    if (outcome === undefined) continue;
    if (
      !outcome ||
      outcome.itemId !== itemId ||
      typeof outcome.selectedAnswer !== "string" ||
      typeof outcome.isCorrect !== "boolean"
    ) {
      return null;
    }
    outcomes[itemId] = outcome;
  }

  const completedAt = candidate.completedAt;
  if (completedAt !== null && (typeof completedAt !== "string" || Number.isNaN(Date.parse(completedAt)))) {
    return null;
  }

  const restored: QuizRunState = {
    schemaVersion: QUIZ_RUN_SCHEMA_VERSION,
    runId: candidate.runId,
    identityKey,
    scope: expectedScope,
    itemIds: [...expectedItemIds],
    outcomes,
    view: candidate.view as QuizRunView,
    completedAt: completedAt ?? null,
    completionEmitted: candidate.completionEmitted,
  };

  const summary = summarizeQuizRun(restored);
  if (summary.isComplete !== Boolean(restored.completedAt)) return null;
  if (!summary.isComplete && restored.view !== "active") return null;
  if (!summary.isComplete && restored.completionEmitted) return null;
  if (restored.view === "review" && summary.missedItemIds.length === 0) return null;
  return restored;
}

export function toCompletionSnapshot(run: QuizRunState): QuizCompletionSnapshot | null {
  const summary = summarizeQuizRun(run);
  if (!summary.isComplete || !run.completedAt) return null;
  const scope = { ...run.scope };
  if (scope.kind !== "collection") {
    scope.navigationKeywords = [...scope.navigationKeywords];
    scope.filterKeywords = [...scope.filterKeywords];
    Object.freeze(scope.navigationKeywords);
    Object.freeze(scope.filterKeywords);
  }
  Object.freeze(scope);
  return Object.freeze({
    runId: run.runId,
    scope,
    completedAt: run.completedAt,
    correct: summary.correct,
    total: summary.total,
    missedItemIds: Object.freeze([...summary.missedItemIds]),
  });
}

export function publishQuizCompletion(snapshot: QuizCompletionSnapshot): void {
  window.dispatchEvent(new CustomEvent<QuizCompletionSnapshot>(QUIZ_COMPLETED_EVENT, { detail: snapshot }));
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getQuizOptions(item: ItemResponse, runId: string): string[] {
  const options = [item.correctAnswer, ...item.incorrectAnswers.slice(0, 3)];
  let seed = hashSeed(`${runId}:${item.id}`);
  for (let index = options.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const target = seed % (index + 1);
    [options[index], options[target]] = [options[target], options[index]];
  }
  return options;
}
