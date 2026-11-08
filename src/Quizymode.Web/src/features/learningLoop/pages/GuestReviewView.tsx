import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { SEO } from "@/components/SEO";
import LoadingSpinner from "@/components/LoadingSpinner";
import { itemsApi } from "@/api/items";
import type { ItemResponse } from "@/types/api";
import { isQuizPlayable } from "@/features/items/quiz/quizRun";
import { FixedSetQuiz } from "../FixedSetQuiz";
import {
  clearLocalReviewList,
  readLocalReviewList,
  removeLocalReviewItem,
  type LocalReviewEntry,
} from "../localReviewList";

/** How many stored items one visit plays (AC 3.14.15). */
const GUEST_REVIEW_BATCH = 20;

interface LoadedBatch {
  items: ItemResponse[];
}

/**
 * Loads each stored id through the public item endpoint (AC 3.0.16 re-check). A missing or private item (404) and an item
 * that is no longer quiz-playable (AC 3.6.17) are removed from the stored list and left out silently. Any other failure
 * keeps the id for a later visit; if nothing could be loaded, the load counts as failed.
 */
async function loadGuestBatch(ids: string[]): Promise<LoadedBatch> {
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const item = await itemsApi.getById(id);
        return isQuizPlayable(item) ? { id, item, drop: false, failed: false } : { id, item: null, drop: true, failed: false };
      } catch (error) {
        const status: number | undefined = isAxiosError(error) ? error.response?.status : undefined;
        return status === 404
          ? { id, item: null, drop: true, failed: false }
          : { id, item: null, drop: false, failed: true };
      }
    }),
  );
  for (const result of results) {
    if (result.drop) removeLocalReviewItem(result.id);
  }
  const items = results.flatMap((result) => (result.item ? [result.item] : []));
  if (items.length === 0 && results.some((result) => result.failed)) {
    throw new Error("Guest review items could not be loaded.");
  }
  return { items };
}

/**
 * Anonymous `/review` (AC 3.14.15): the questions this browser has kept, played as a quiz. Answering correctly removes an
 * item from this browser's list; a wrong answer keeps it. Nothing here calls the review-queue API.
 */
export function GuestReviewView() {
  // The visit's snapshot: the batch is frozen so removing an answered item cannot change the quiz mid-run.
  const [session] = useState(() => {
    const all: LocalReviewEntry[] = readLocalReviewList();
    return { all, batchIds: all.slice(0, GUEST_REVIEW_BATCH).map((entry) => entry.itemId) };
  });
  const [remaining, setRemaining] = useState<number>(session.all.length);

  const query = useQuery({
    queryKey: ["guest-review", session.batchIds.join(",")],
    queryFn: () => loadGuestBatch(session.batchIds),
    enabled: session.batchIds.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    gcTime: 0,
    retry: false,
  });

  const clearList = () => {
    clearLocalReviewList();
    setRemaining(0);
  };

  const header = (
    <header className="mb-4">
      <h1 className="text-2xl font-bold text-gray-900">Review</h1>
      <p className="mt-1 text-sm text-gray-600">
        Questions you missed in this browser. Get one right and it leaves the list. Sign in to get spaced reminders.
      </p>
    </header>
  );

  const emptyState = (
    <div className="rounded-lg border border-gray-200 bg-surface p-4 text-sm text-gray-700">
      <p className="font-semibold text-gray-900">Nothing to review right now.</p>
      <p className="mt-1">Miss a question in a quiz, or mark a flashcard Still learning, and it waits here.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/daily" className="rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700">
          Play the daily quiz
        </Link>
        <Link to="/categories" className="rounded-md border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50">
          Browse categories
        </Link>
      </div>
    </div>
  );

  let body: ReactNode;
  if (session.batchIds.length === 0 || remaining === 0) {
    body = emptyState;
  } else if (query.isLoading) {
    body = <LoadingSpinner />;
  } else if (query.isError) {
    body = (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Your review questions could not be loaded.{" "}
        <button type="button" onClick={() => void query.refetch()} className="font-semibold underline">
          Try again
        </button>
      </div>
    );
  } else if (!query.data || query.data.items.length === 0) {
    body = emptyState;
  } else {
    body = (
      <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
          <p>
            This browser only.
            {session.all.length > query.data.items.length
              ? ` Showing ${query.data.items.length} of ${session.all.length}.`
              : ` ${query.data.items.length} to review.`}
          </p>
          <button type="button" onClick={clearList} className="font-semibold text-indigo-ink underline">
            Clear list
          </button>
        </div>
        <FixedSetQuiz
          items={query.data.items}
          identityKey="guest"
          analytics={{ contextType: "review" }}
          browsePath="/categories"
          browseLabel="Browse categories"
          onAnswer={(item, isCorrect) => {
            if (!isCorrect) return;
            removeLocalReviewItem(item.id);
            setRemaining(readLocalReviewList().length);
          }}
        />
      </>
    );
  }

  return (
    <>
      <SEO title="Review | Quizymode" description="Review the questions you missed in this browser." noindex />
      <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6">
        {header}
        {body}
      </div>
    </>
  );
}
