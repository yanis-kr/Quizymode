import type { ItemResponse } from "@/types/api";
import { categoryNameToSlug } from "@/utils/categorySlug";

export const QUIZ_RUN_SCHEMA_VERSION = 2;
export const QUIZ_COMPLETED_EVENT = "quizymode:quiz-completed";
/** Test (AC 3.18): time limit bounds in seconds, and the roster cap set by the analytics 500 limit. */
export const TEST_MIN_LIMIT_SEC = 60;
export const TEST_MAX_LIMIT_SEC = 36000;
export const TEST_MAX_QUESTIONS = 500;

export type QuizRunView = "active" | "summary" | "review" | "review-all";
export type QuizRunMode = "practice" | "test";
export type TestSubmitReason = "manual" | "timeout";

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
  /** Practice reveals feedback per answer; Test hides it until submit (AC 3.18). */
  mode: QuizRunMode;
  /** Test only: flagged item ids in roster order. Always empty in Practice. */
  flagged: string[];
  /** Test only: ISO time of Start test; null on the setup card and in Practice. */
  startedAt: string | null;
  /** Test only: overall limit in seconds, or null for no limit. */
  timeLimitSec: number | null;
  /** Test only: ISO time of submit (the deadline for a timeout). */
  submittedAt: string | null;
  submitReason: TestSubmitReason | null;
  view: QuizRunView;
  completedAt: string | null;
  completionEmitted: boolean;
}

export interface QuizRunSummary {
  answered: number;
  correct: number;
  total: number;
  /** Wrong answers first, then (submitted Test) unanswered items in roster order. */
  missedItemIds: string[];
  /** Roster items with no answer. */
  notAnswered: number;
  percentage: number;
  isComplete: boolean;
}

/** Study mode a completed run was played in (issue #306). */
export type StudySessionMode = "quiz" | "learn";

export interface QuizCompletionSnapshot {
  readonly runId: string;
  readonly scope: QuizRunScope;
  readonly completedAt: string;
  readonly correct: number;
  readonly total: number;
  readonly missedItemIds: readonly string[];
  /** Defaults to "quiz" when omitted (issue #306). */
  readonly mode?: StudySessionMode;
}

export type QuizRunAction =
  | { type: "answer"; itemId: string; selectedAnswer: string; isCorrect: boolean; completedAt: string }
  | { type: "start-test"; startedAt: string; timeLimitSec: number | null }
  | { type: "toggle-flag"; itemId: string }
  | { type: "submit"; submittedAt: string; reason: TestSubmitReason }
  | { type: "show-summary" }
  | { type: "review-mistakes" }
  | { type: "review-all" }
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
  mode: QuizRunMode = "practice",
): QuizRunState {
  return {
    schemaVersion: QUIZ_RUN_SCHEMA_VERSION,
    runId: newRunId(),
    identityKey,
    scope,
    itemIds: Array.from(new Set(itemIds.filter(Boolean))),
    outcomes: {},
    mode,
    flagged: [],
    startedAt: null,
    timeLimitSec: null,
    submittedAt: null,
    submitReason: null,
    view: "active",
    completedAt: null,
    completionEmitted: false,
  };
}

/** Test deadline in epoch ms, or null when the Test has no limit or has not started. */
export function getTestDeadlineMs(run: Pick<QuizRunState, "startedAt" | "timeLimitSec">): number | null {
  if (!run.startedAt || run.timeLimitSec === null) return null;
  const started = Date.parse(run.startedAt);
  return Number.isNaN(started) ? null : started + run.timeLimitSec * 1000;
}

/** True once a Test has been started and not yet submitted. */
export function isTestInProgress(run: Pick<QuizRunState, "mode" | "startedAt" | "submittedAt">): boolean {
  return run.mode === "test" && run.startedAt !== null && run.submittedAt === null;
}

export function summarizeQuizRun(run: QuizRunState): QuizRunSummary {
  const outcomes = run.itemIds
    .map((itemId) => run.outcomes[itemId])
    .filter((outcome): outcome is QuizAnswerOutcome => Boolean(outcome));
  const correct = outcomes.filter((outcome) => outcome.isCorrect).length;
  const total = run.itemIds.length;
  const wrong = outcomes.filter((outcome) => !outcome.isCorrect).map((outcome) => outcome.itemId);
  const unanswered = run.itemIds.filter((itemId) => !run.outcomes[itemId]);
  const isTest = run.mode === "test";

  return {
    answered: outcomes.length,
    correct,
    total,
    // A submitted Test scores unanswered questions as wrong (AC 3.18.8), listed after the wrong answers.
    missedItemIds: isTest && run.submittedAt !== null ? [...wrong, ...unanswered] : wrong,
    notAnswered: unanswered.length,
    percentage: total === 0 ? 0 : Math.round((correct / total) * 100),
    isComplete: isTest ? total > 0 && run.submittedAt !== null : total > 0 && outcomes.length === total,
  };
}

export function reduceQuizRun(run: QuizRunState, action: QuizRunAction): QuizRunState {
  if (action.type === "start-test") {
    if (run.mode !== "test" || run.startedAt !== null || Number.isNaN(Date.parse(action.startedAt))) return run;
    if (
      action.timeLimitSec !== null &&
      (!Number.isInteger(action.timeLimitSec) ||
        action.timeLimitSec < TEST_MIN_LIMIT_SEC ||
        action.timeLimitSec > TEST_MAX_LIMIT_SEC)
    ) {
      return run;
    }
    return { ...run, startedAt: action.startedAt, timeLimitSec: action.timeLimitSec };
  }

  if (action.type === "toggle-flag") {
    if (!isTestInProgress(run) || !run.itemIds.includes(action.itemId)) return run;
    const flagged = new Set(run.flagged);
    if (!flagged.delete(action.itemId)) flagged.add(action.itemId);
    return { ...run, flagged: run.itemIds.filter((itemId) => flagged.has(itemId)) };
  }

  if (action.type === "submit") {
    if (!isTestInProgress(run)) return run;
    const submittedMs = Date.parse(action.submittedAt);
    if (Number.isNaN(submittedMs)) return run;
    let submittedAt = action.submittedAt;
    let reason = action.reason;
    const deadline = getTestDeadlineMs(run);
    if (deadline !== null && submittedMs >= deadline) {
      // The deadline is the completion time, however late the submit arrives (AC 3.18.6).
      submittedAt = new Date(deadline).toISOString();
      reason = "timeout";
    }
    return { ...run, submittedAt, submitReason: reason, completedAt: submittedAt, view: "summary" };
  }

  if (action.type === "review-all") {
    return run.mode === "test" && run.submittedAt !== null ? { ...run, view: "review-all" } : run;
  }

  if (action.type === "answer") {
    if (!run.itemIds.includes(action.itemId)) return run;

    if (run.mode === "test") {
      // Test: the last answer before submit counts; answers at or after the deadline are ignored.
      if (!isTestInProgress(run)) return run;
      const answeredAt = Date.parse(action.completedAt);
      const deadline = getTestDeadlineMs(run);
      if (Number.isNaN(answeredAt) || (deadline !== null && answeredAt >= deadline)) return run;
      return {
        ...run,
        outcomes: {
          ...run.outcomes,
          [action.itemId]: {
            itemId: action.itemId,
            selectedAnswer: action.selectedAnswer,
            isCorrect: action.isCorrect,
          },
        },
      };
    }

    if (run.outcomes[action.itemId]) return run;

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
  expectedMode: QuizRunMode = "practice",
): QuizRunState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<QuizRunState>;
  if (
    candidate.schemaVersion !== QUIZ_RUN_SCHEMA_VERSION ||
    candidate.mode !== expectedMode ||
    typeof candidate.runId !== "string" ||
    candidate.runId.length === 0 ||
    candidate.runId.length > 128 ||
    candidate.identityKey !== identityKey ||
    !sameQuizScope(candidate.scope, expectedScope) ||
    !sameStringArray(candidate.itemIds, expectedItemIds) ||
    !candidate.outcomes ||
    typeof candidate.outcomes !== "object" ||
    !["active", "summary", "review", "review-all"].includes(candidate.view ?? "") ||
    typeof candidate.completionEmitted !== "boolean"
  ) {
    return null;
  }

  const testFields = restoreTestFields(candidate, expectedMode, expectedItemIds);
  if (!testFields) return null;

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
    mode: expectedMode,
    ...testFields,
    view: candidate.view as QuizRunView,
    completedAt: completedAt ?? null,
    completionEmitted: candidate.completionEmitted,
  };

  const summary = summarizeQuizRun(restored);
  if (summary.isComplete !== Boolean(restored.completedAt)) return null;
  if (!summary.isComplete && restored.view !== "active") return null;
  if (!summary.isComplete && restored.completionEmitted) return null;
  if (restored.view === "review" && summary.missedItemIds.length === 0) return null;
  if (restored.view === "review-all" && expectedMode !== "test") return null;
  if (restored.mode === "test" && restored.submittedAt !== null && restored.view === "active") return null;
  if (restored.mode === "test" && restored.submittedAt !== null && restored.completedAt !== restored.submittedAt) {
    return null;
  }
  return restored;
}

type RestoredTestFields = Pick<
  QuizRunState,
  "flagged" | "startedAt" | "timeLimitSec" | "submittedAt" | "submitReason"
>;

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** AC 3.18.7: validates the Test fields of a stored snapshot; null rejects the whole snapshot. */
function restoreTestFields(
  candidate: Partial<QuizRunState>,
  mode: QuizRunMode,
  itemIds: string[],
): RestoredTestFields | null {
  const { flagged, startedAt, timeLimitSec, submittedAt, submitReason } = candidate;
  const none: RestoredTestFields = { flagged: [], startedAt: null, timeLimitSec: null, submittedAt: null, submitReason: null };

  if (mode === "practice") {
    const carriesTestFields =
      !Array.isArray(flagged) ||
      flagged.length > 0 ||
      startedAt !== null ||
      timeLimitSec !== null ||
      submittedAt !== null ||
      submitReason !== null;
    return carriesTestFields ? null : none;
  }

  if (!Array.isArray(flagged) || flagged.some((id) => typeof id !== "string" || !itemIds.includes(id))) return null;
  if (new Set(flagged).size !== flagged.length) return null;

  if (startedAt === null) {
    // Setup card: nothing may have happened yet.
    const untouched =
      flagged.length === 0 &&
      timeLimitSec === null &&
      submittedAt === null &&
      submitReason === null &&
      candidate.view === "active" &&
      candidate.completedAt === null &&
      candidate.completionEmitted === false &&
      Object.keys(candidate.outcomes ?? {}).length === 0;
    return untouched ? none : null;
  }

  const startedMs = parseTimestamp(startedAt);
  if (startedMs === null || typeof startedAt !== "string") return null;
  if (timeLimitSec !== null) {
    if (
      typeof timeLimitSec !== "number" ||
      !Number.isInteger(timeLimitSec) ||
      timeLimitSec < TEST_MIN_LIMIT_SEC ||
      timeLimitSec > TEST_MAX_LIMIT_SEC
    ) {
      return null;
    }
  }

  if (submittedAt === null) {
    if (submitReason !== null || candidate.view !== "active" || candidate.completionEmitted) return null;
  } else {
    const submittedMs = parseTimestamp(submittedAt);
    if (submittedMs === null || submittedMs < startedMs) return null;
    if (submitReason !== "manual" && submitReason !== "timeout") return null;
  }

  return {
    flagged: itemIds.filter((id) => flagged.includes(id)),
    startedAt,
    timeLimitSec: timeLimitSec ?? null,
    submittedAt: submittedAt ?? null,
    submitReason: submitReason ?? null,
  };
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

/**
 * Single playability filter (#250): trim, drop blanks, drop case-insensitive duplicates and drop values equal to the
 * correct answer. Mirrored server-side by QuizPlayability.GetDistractors (Daily selection, review queue).
 */
function getQuizDistractors(item: Pick<ItemResponse, "correctAnswer" | "incorrectAnswers">): string[] {
  const correct = (item.correctAnswer ?? "").trim().toLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of item.incorrectAnswers ?? []) {
    const value = (raw ?? "").trim();
    const key = value.toLowerCase();
    if (!value || key === correct || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/** An item can be quizzed when at least one usable distractor remains. */
export function isQuizPlayable(item: Pick<ItemResponse, "correctAnswer" | "incorrectAnswers">): boolean {
  return getQuizDistractors(item).length > 0;
}

export function getQuizOptions(item: ItemResponse, runId: string): string[] {
  const options = [item.correctAnswer, ...getQuizDistractors(item).slice(0, 3)];
  let seed = hashSeed(`${runId}:${item.id}`);
  for (let index = options.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const target = seed % (index + 1);
    [options[index], options[target]] = [options[target], options[index]];
  }
  return options;
}

interface SeedQuizRosterOptions {
  /** Category slug from the URL (not the resolved name); undefined for a global quiz. */
  categorySlug?: string;
  navigationKeywords: readonly string[];
  filterKeywords: readonly string[];
  quizSize: number;
}

/**
 * AC 3.6.17 (#278): a cold deep link starts the run on the entry item when that item is
 * quiz-playable, public and in the quiz's scope; the random items follow without duplicates.
 * Otherwise the random roster is returned unchanged (the #275 rewrite then applies).
 */
export function seedQuizRoster<T extends ItemResponse>(
  randomItems: readonly T[],
  linked: T | null | undefined,
  options: SeedQuizRosterOptions
): T[] {
  const random = [...randomItems];
  if (!linked || !linked.id || linked.isPrivate || !isQuizPlayable(linked)) return random;
  if (options.filterKeywords.length > 0) return random;
  if (options.categorySlug) {
    if (options.navigationKeywords.length > 0) return random;
    if (!linked.category) return random;
    if (
      categoryNameToSlug(linked.category).toLowerCase() !==
      options.categorySlug.toLowerCase()
    ) {
      return random;
    }
  }
  return [linked, ...random.filter((item) => item.id !== linked.id)].slice(
    0,
    options.quizSize
  );
}
