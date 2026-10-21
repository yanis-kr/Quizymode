import { useEffect, useMemo, useRef, useState } from "react";
import type { ItemResponse } from "@/types/api";
import { useStudyHotkeys } from "@/components/study/useStudyHotkeys";
import { StudyHotkeysDialog } from "@/components/study/StudyHotkeysDialog";
import { QUIZ_SHORTCUTS } from "@/components/study/studyShortcuts";
import { StudyHotkeysHint } from "@/components/study/StudyHotkeysHint";
import { QuizRenderer } from "@/components/study/QuizRenderer";
import { QuizCompletionView } from "@/features/items/quiz/QuizCompletionView";
import type { ResultShareDescriptor } from "@/features/items/quiz/resultShare";
import {
  createQuizRun,
  getQuizOptions,
  reduceQuizRun,
  summarizeQuizRun,
  type QuizRunState,
} from "@/features/items/quiz/quizRun";
import {
  flushDeferredAnalyticsEvents,
  trackEventDeferredOnce,
  trackEventOnce,
  type AnalyticsContextType,
} from "@/features/analytics/analyticsEvents";

export interface FixedSetQuizAnalytics {
  contextType: Extract<AnalyticsContextType, "daily" | "review">;
  contextId?: string;
}

export interface FixedSetQuizProps {
  /** Frozen roster: the run never refetches or reorders it. */
  items: ItemResponse[];
  identityKey: string;
  analytics: FixedSetQuizAnalytics;
  browsePath: string;
  browseLabel: string;
  /** Called once per item per run with the first (scored) answer. */
  onAnswer?: (item: ItemResponse, isCorrect: boolean, run: QuizRunState) => void;
  /** Called once per run when every item has an answer. */
  onComplete?: (run: QuizRunState) => void;
  /** Builds the Share result descriptor for the finished run; omitted for the review queue (no Share). */
  share?: (run: QuizRunState) => ResultShareDescriptor | null;
}

function newRun(items: ItemResponse[], identityKey: string): QuizRunState {
  return createQuizRun(
    { kind: "global", category: null, navigationKeywords: [], filterKeywords: [], quizSize: items.length },
    items.map((item) => item.id),
    identityKey,
  );
}

/**
 * A quiz over a fixed list of items (daily quiz, review queue). Same answer-locking, scoring, results and mistake
 * review as the main quiz (AC 3.6.8–3.6.11), without per-item URLs. Analytics use the run's own context type so these
 * runs are reported separately from category, collection and unscoped quizzes.
 */
export function FixedSetQuiz({
  items,
  identityKey,
  analytics,
  browsePath,
  browseLabel,
  onAnswer,
  onComplete,
  share,
}: FixedSetQuizProps) {
  const [run, setRun] = useState<QuizRunState>(() => newRun(items, identityKey));
  const [index, setIndex] = useState(0);
  const completedRunIds = useRef(new Set<string>());
  const questionHeadingRef = useRef<HTMLParagraphElement>(null);
  const item = items[index];
  const summary = summarizeQuizRun(run);
  const outcome = item ? run.outcomes[item.id] : undefined;
  const options = useMemo(() => (item ? getQuizOptions(item, run.runId) : []), [item, run.runId]);
  const context = analytics.contextId
    ? { contextType: analytics.contextType, contextId: analytics.contextId }
    : { contextType: analytics.contextType };

  useEffect(() => {
    trackEventOnce(run.runId, { name: "quick_quiz_started", runId: run.runId, total: run.itemIds.length, ...context });
    // context is derived from props that do not change during a run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.runId]);

  useEffect(() => {
    if (!summary.isComplete || completedRunIds.current.has(run.runId)) return;
    completedRunIds.current.add(run.runId);
    flushDeferredAnalyticsEvents();
    trackEventOnce(run.runId, {
      name: "quiz_completed",
      runId: run.runId,
      score: summary.correct,
      total: summary.total,
      ...context,
    });
    onComplete?.(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.isComplete, run.runId]);

  const handleAnswer = (answer: string) => {
    if (!item || outcome) return;
    const isCorrect = answer === item.correctAnswer;
    const next = reduceQuizRun(run, {
      type: "answer",
      itemId: item.id,
      selectedAnswer: answer,
      isCorrect,
      completedAt: new Date().toISOString(),
    });
    setRun(next);
    trackEventDeferredOnce(`${run.runId}:${item.id}`, {
      name: "question_answered",
      runId: run.runId,
      itemId: item.id,
      position: index + 1,
      isCorrect,
      ...context,
    });
    onAnswer?.(item, isCorrect, next);
  };

  const goTo = (nextIndex: number) => {
    setIndex(nextIndex);
    requestAnimationFrame(() => questionHeadingRef.current?.focus());
  };

  const isLast = index === items.length - 1;
  const isActive = run.view === "active" && !!item;
  const canGoNext = !isLast && Boolean(outcome);
  const { isHelpOpen, openHelp, closeHelp } = useStudyHotkeys({
    enabled: true,
    letter: isActive && !outcome ? (i) => options[i] !== undefined && handleAnswer(options[i]) : undefined,
    digit: isActive && !outcome ? (n) => options[n - 1] !== undefined && handleAnswer(options[n - 1]) : undefined,
    prev: isActive && index > 0 ? () => goTo(index - 1) : undefined,
    next: isActive && !summary.isComplete && canGoNext ? () => goTo(index + 1) : undefined,
    enter:
      isActive && outcome
        ? () => {
            if (summary.isComplete) setRun((current) => reduceQuizRun(current, { type: "show-summary" }));
            else if (canGoNext) goTo(index + 1);
          }
        : undefined,
  });
  const helpDialog = <StudyHotkeysDialog open={isHelpOpen} onClose={closeHelp} shortcuts={isActive ? QUIZ_SHORTCUTS : []} />;

  if (run.view !== "active") {
    return (
      <>
      <QuizCompletionView
        run={run}
        items={items}
        browsePath={browsePath}
        browseLabel={browseLabel}
        onReviewMistakes={() => setRun((current) => reduceQuizRun(current, { type: "review-mistakes" }))}
        onBackToResults={() => setRun((current) => ({ ...current, view: "summary" }))}
        onPlayAgain={() => {
          setRun(newRun(items, identityKey));
          setIndex(0);
        }}
        share={run.view === "summary" ? share?.(run) : null}
        analyticsContext={context}
      />
      {helpDialog}
      </>
    );
  }

  if (!item) return null;

  return (
    <section className="mx-auto max-w-2xl rounded-lg bg-white p-4 shadow sm:p-6" aria-label="Quiz">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
        <p ref={questionHeadingRef} tabIndex={-1} className="font-semibold text-gray-800 focus:outline-none" aria-live="polite">
          Question {index + 1} of {items.length}
        </p>
        <div className="flex items-center gap-2">
          <p>
            {summary.correct} correct · {summary.answered} answered
          </p>
          <StudyHotkeysHint onClick={openHelp} />
        </div>
      </div>
      <QuizRenderer
        item={item}
        options={options}
        selectedAnswer={outcome?.selectedAnswer ?? null}
        showAnswer={Boolean(outcome)}
        onAnswerSelect={handleAnswer}
        stats={{ total: summary.answered, correct: summary.correct }}
      />
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Previous
        </button>
        {summary.isComplete ? (
          <button
            type="button"
            onClick={() => setRun((current) => reduceQuizRun(current, { type: "show-summary" }))}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            View results
          </button>
        ) : (
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={isLast || !outcome}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Next
          </button>
        )}
      </div>
      {helpDialog}
    </section>
  );
}
