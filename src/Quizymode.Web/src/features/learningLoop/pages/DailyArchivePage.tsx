import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SEO } from "@/components/SEO";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { dailyQuizApi } from "@/api/learningLoop";
import { summarizeQuizRun, type QuizRunState } from "@/features/items/quiz/quizRun";
import { FixedSetQuiz } from "../FixedSetQuiz";
import { readArchiveResults, recordArchiveResult } from "../archiveLocalState";

function scoreLabel(correct: number, total: number, skipped: number): string {
  const scored = total - skipped;
  return scored === 0 ? "No questions were scored" : `${correct} / ${scored}`;
}

/**
 * #677: the last 7 stored daily sets. An archive run never calls the completion endpoint and never writes the browser
 * streak, so it cannot change the streak; its analytics events carry an `archive:` context id.
 */
const DailyArchivePage = () => {
  const { isAuthenticated, isLoading: isAuthLoading, userId } = useAuth();
  const identityKey = isAuthenticated ? `user:${userId ?? "unknown"}` : "guest";
  const [selected, setSelected] = useState<string | null>(null);
  const [localResults, setLocalResults] = useState(() => readArchiveResults());

  const list = useQuery({
    queryKey: ["daily-quiz-archive", identityKey],
    queryFn: () => dailyQuizApi.archive(),
    enabled: !isAuthLoading,
    retry: 1,
  });
  const day = useQuery({
    queryKey: ["daily-quiz-archive-day", identityKey, selected],
    queryFn: () => dailyQuizApi.getArchiveDay(selected as string),
    enabled: !isAuthLoading && selected !== null,
    retry: 1,
  });

  const handleComplete = (run: QuizRunState) => {
    if (isAuthenticated || !selected) return;
    const summary = summarizeQuizRun(run);
    recordArchiveResult({ date: selected, correct: summary.correct, total: summary.scoredTotal });
    setLocalResults(readArchiveResults());
  };

  return (
    <>
      <SEO title="Daily quiz archive" description="Play the daily quizzes you missed this week." canonical="https://www.quizymode.com/daily/archive" />
      <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Daily quiz archive</h1>
          <p className="mt-1 text-sm text-gray-600">Earlier daily quizzes from the last week. They never change your streak.</p>
          <p className="mt-2 text-sm">
            <Link to="/daily" className="font-semibold text-indigo-ink underline">Back to today's quiz</Link>
          </p>
        </header>

        {(isAuthLoading || list.isLoading) && <LoadingSpinner />}
        {list.isError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            The archive could not be loaded.
          </div>
        )}

        {selected === null && list.data && list.data.days.length === 0 && (
          <p className="rounded-lg border border-gray-200 bg-surface p-4 text-sm text-gray-700">There are no earlier daily quizzes yet.</p>
        )}

        {selected === null && list.data && list.data.days.length > 0 && (
          <ul className="space-y-2">
            {list.data.days.map((entry) => {
              const result = isAuthenticated ? entry.completion : localResults.find((r) => r.date === entry.date) ?? null;
              const skipped = result && "skipped" in result ? result.skipped ?? 0 : 0;
              return (
                <li key={entry.date} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-surface p-3">
                  <div>
                    <p className="font-semibold text-gray-900">{entry.date}</p>
                    <p className="text-sm text-gray-600">
                      {result ? `Played: ${scoreLabel(result.correct, result.total, skipped)}` : "Not played"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(entry.date)}
                    className="min-h-[44px] rounded-md border border-indigo-ink px-4 py-2 text-sm font-semibold text-indigo-ink hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  >
                    {result ? `Play ${entry.date} again` : `Play ${entry.date}`}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selected !== null && (
          <>
            <button type="button" onClick={() => setSelected(null)} className="mb-3 text-sm font-semibold text-indigo-ink underline">
              Back to the archive
            </button>
            {day.isLoading && <LoadingSpinner />}
            {day.isError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                That daily quiz could not be loaded.
              </div>
            )}
            {day.data && day.data.items.length > 0 && (
              <FixedSetQuiz
                key={`${day.data.date}:${identityKey}`}
                items={day.data.items}
                identityKey={identityKey}
                analytics={{ contextType: "daily", contextId: `archive:${day.data.date}` }}
                browsePath="/categories"
                browseLabel="Browse categories"
                onComplete={handleComplete}
              />
            )}
          </>
        )}
      </div>
    </>
  );
};

export default DailyArchivePage;
