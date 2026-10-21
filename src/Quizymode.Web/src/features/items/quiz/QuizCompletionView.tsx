import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { ItemResponse } from "@/types/api";
import type { QuizRunState } from "./quizRun";
import { summarizeQuizRun } from "./quizRun";
import { SignupPrompt } from "@/features/auth/components/SignupPrompt";
import { celebratePerfectScore } from "./celebrate";
import { scoreTier, type ResultShareDescriptor } from "./resultShare";
import { ShareResultButton } from "./ShareResultButton";
import type { StudyEventContext } from "./quizAnalytics";

interface QuizCompletionViewProps {
  run: QuizRunState;
  items: ItemResponse[];
  browsePath: string;
  browseLabel: string;
  onReviewMistakes: () => void;
  onBackToResults: () => void;
  onPlayAgain: () => void;
  /** What Share result sends; omitted (for example for the review queue) hides the button. */
  share?: ResultShareDescriptor | null;
  /** The run's own analytics context for the share event. */
  analyticsContext?: StudyEventContext;
}

export function QuizCompletionView({
  run,
  items,
  browsePath,
  browseLabel,
  onReviewMistakes,
  onBackToResults,
  onPlayAgain,
  share,
  analyticsContext,
}: QuizCompletionViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summary = summarizeQuizRun(run);

  useEffect(() => {
    headingRef.current?.focus();
  }, [run.view]);

  const tier = scoreTier(summary.percentage, summary.total);
  const isPerfect = tier?.id === "perfect";
  const isSummaryView = run.view === "summary";

  // After the heading has focus: one burst per run for a perfect score.
  useEffect(() => {
    if (isSummaryView && isPerfect) void celebratePerfectScore(run.runId);
  }, [isSummaryView, isPerfect, run.runId]);

  if (run.view === "review") {
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const unavailableCount = summary.missedItemIds.filter((itemId) => !itemsById.has(itemId)).length;
    return (
      <section className="mx-auto max-w-4xl rounded-lg bg-white p-4 shadow sm:p-6">
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">
          Review mistakes
        </h2>
        <div className="mt-4 space-y-4">
          {summary.missedItemIds.map((itemId) => {
            const item = itemsById.get(itemId);
            const outcome = run.outcomes[itemId];
            if (!item || !outcome) return null;
            return (
              <article key={itemId} className="rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900">{item.question}</h3>
                <p className="mt-2 text-sm text-red-700"><strong>Your answer:</strong> {outcome.selectedAnswer}</p>
                <p className="mt-1 text-sm text-green-700"><strong>Correct answer:</strong> {item.correctAnswer}</p>
                {item.explanation && <p className="mt-2 text-sm text-gray-700">{item.explanation}</p>}
              </article>
            );
          })}
        </div>
        {unavailableCount > 0 && (
          <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {unavailableCount} missed {unavailableCount === 1 ? "question is" : "questions are"} no longer available to review. Your completed score has not changed.
          </p>
        )}
        <button type="button" onClick={onBackToResults} className="mt-5 rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
          Back to results
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl rounded-lg bg-white p-4 text-center shadow sm:p-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">
        Quiz complete
      </h2>
      {tier && <p className="mt-2 text-lg font-semibold text-gray-800">{tier.label}</p>}
      <p className="mt-3 text-3xl font-bold text-indigo-700">{summary.correct} / {summary.total}</p>
      <p className="mt-1 text-gray-700">{summary.percentage}% correct · {summary.missedItemIds.length} missed</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
        {summary.missedItemIds.length > 0 && (
          <button type="button" onClick={onReviewMistakes} className="rounded-md border border-indigo-600 px-4 py-2 font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            Review mistakes
          </button>
        )}
        <button
          type="button"
          onClick={onPlayAgain}
          className={
            isPerfect && share && summary.total > 0
              ? "rounded-md border border-indigo-600 px-4 py-2 font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              : "rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          }
        >
          Play again
        </button>
        {share && summary.total > 0 && (
          <ShareResultButton
            descriptor={share}
            runId={run.runId}
            score={summary.correct}
            total={summary.total}
            context={analyticsContext ?? { contextType: "quiz" }}
            emphasized={isPerfect}
          />
        )}
        <Link to={browsePath} className="rounded-md border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
          {browseLabel}
        </Link>
      </div>
      {/* Shown only after the run is complete (never mid-quiz), only to anonymous visitors (AC 4.2.10). */}
      <SignupPrompt reason="save-progress" className="mt-6" />
    </section>
  );
}
