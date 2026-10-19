import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SEO } from "@/components/SEO";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { reviewQueueApi } from "@/api/learningLoop";
import { FixedSetQuiz } from "../FixedSetQuiz";

export const REVIEW_QUEUE_QUERY_KEY = ["review-queue"] as const;

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

interface Tally {
  forward: number;
  reset: number;
  graduated: number;
  failed: number;
}

const EMPTY_TALLY: Tally = { forward: 0, reset: 0, graduated: 0, failed: 0 };

/**
 * REVIEW-001 (#117): up to 20 due questions the signed-in learner missed before. Each first answer is saved as it is
 * chosen: correct moves the question to a longer interval (1, 3, 7, 14, 30 days, then done), wrong brings it back tomorrow.
 */
const ReviewQueuePage = () => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);

  // The roster is frozen for the visit: no refetch while answering, or answered items would vanish mid-run.
  const query = useQuery({
    queryKey: [...REVIEW_QUEUE_QUERY_KEY, "session", userId],
    queryFn: () => reviewQueueApi.get(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    // A new visit always loads the current queue; answered items from an earlier visit are not due any more.
    refetchOnMount: "always",
    gcTime: 0,
    retry: 1,
  });

  const recordAnswer = async (itemId: string, isCorrect: boolean) => {
    try {
      const response = await reviewQueueApi.answer(itemId, isCorrect);
      if (!response.applied) return;
      setTally((current) => ({
        ...current,
        graduated: current.graduated + (response.graduated ? 1 : 0),
        forward: current.forward + (isCorrect && !response.graduated ? 1 : 0),
        reset: current.reset + (isCorrect ? 0 : 1),
      }));
    } catch {
      setTally((current) => ({ ...current, failed: current.failed + 1 }));
    }
    void queryClient.invalidateQueries({ queryKey: [...REVIEW_QUEUE_QUERY_KEY, "summary"] });
  };

  const data = query.data;

  return (
    <>
      <SEO title="Review | Quizymode" description="Review the questions you missed." noindex />
      <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Review</h1>
          <p className="mt-1 text-sm text-gray-600">
            Questions you missed come back the next day. Get one right and it waits longer before returning: 3, 7, 14, then 30 days.
          </p>
        </header>

        {query.isLoading && <LoadingSpinner />}

        {query.isError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Your review questions could not be loaded.{" "}
            <button type="button" onClick={() => void query.refetch()} className="font-semibold underline">
              Try again
            </button>
          </div>
        )}

        {data && data.items.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">Nothing to review right now.</p>
            {data.nextDueAt ? (
              <p className="mt-1">
                {data.totalCount} {data.totalCount === 1 ? "question is" : "questions are"} scheduled. The next one is due{" "}
                {dateFormatter.format(new Date(data.nextDueAt))}.
              </p>
            ) : (
              <p className="mt-1">Questions you miss in a quiz while signed in show up here the next day.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/daily" className="rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700">
                Play the daily quiz
              </Link>
              <Link to="/categories" className="rounded-md border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50">
                Browse categories
              </Link>
            </div>
          </div>
        )}

        {data && data.items.length > 0 && (
          <>
            {data.dueCount > data.items.length && (
              <p className="mb-3 text-sm text-gray-600">
                Showing {data.items.length} of {data.dueCount} due questions. The rest stay due for your next review.
              </p>
            )}
            <div aria-live="polite" className="mb-3 text-sm text-gray-700">
              {tally.forward + tally.reset + tally.graduated > 0 && (
                <p>
                  {tally.forward} moved to a longer interval · {tally.reset} back tomorrow
                  {tally.graduated > 0 && ` · ${tally.graduated} done`}
                </p>
              )}
              {tally.failed > 0 && (
                <p role="alert" className="text-red-700">
                  {tally.failed} {tally.failed === 1 ? "answer was" : "answers were"} not saved; {tally.failed === 1 ? "it stays" : "they stay"} due.
                </p>
              )}
            </div>
            <FixedSetQuiz
              items={data.items}
              identityKey={`user:${userId ?? "unknown"}`}
              analytics={{ contextType: "review" }}
              browsePath="/categories"
              browseLabel="Browse categories"
              onAnswer={(item, isCorrect) => void recordAnswer(item.id, isCorrect)}
            />
          </>
        )}
      </div>
    </>
  );
};

export default ReviewQueuePage;
