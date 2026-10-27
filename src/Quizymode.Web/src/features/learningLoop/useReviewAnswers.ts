import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { reviewQueueApi } from "@/api/learningLoop";

export const REVIEW_QUEUE_SUMMARY_KEY = ["review-queue", "summary"] as const;

export interface ReviewTally {
  forward: number;
  reset: number;
  graduated: number;
  failed: number;
}

const EMPTY_TALLY: ReviewTally = { forward: 0, reset: 0, graduated: 0, failed: 0 };

/**
 * Saves first answers to the review schedule and tallies how it moved (shared by the normal review and the boss fight).
 * `settlePending` resolves once every save started so far has finished, so a summary read afterwards is current.
 */
export function useReviewAnswers() {
  const queryClient = useQueryClient();
  const [tally, setTally] = useState<ReviewTally>(EMPTY_TALLY);
  const pending = useRef(new Set<Promise<void>>());

  const save = async (itemId: string, isCorrect: boolean): Promise<void> => {
    try {
      const response = await reviewQueueApi.answer(itemId, isCorrect);
      // An answer the server did not apply (already scheduled elsewhere) changes nothing here.
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
    void queryClient.invalidateQueries({ queryKey: REVIEW_QUEUE_SUMMARY_KEY });
  };

  const recordAnswer = (itemId: string, isCorrect: boolean): Promise<void> => {
    const promise: Promise<void> = save(itemId, isCorrect);
    pending.current.add(promise);
    void promise.then(() => pending.current.delete(promise));
    return promise;
  };

  const settlePending = async (): Promise<void> => {
    await Promise.allSettled([...pending.current]);
  };

  const resetTally = () => setTally(EMPTY_TALLY);

  return { tally, recordAnswer, settlePending, resetTally };
}
