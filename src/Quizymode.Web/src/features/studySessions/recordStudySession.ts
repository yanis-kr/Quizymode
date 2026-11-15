import { studySessionsApi, type RecordStudySessionRequest } from "@/api/studySessions";
import type { QuizCompletionSnapshot } from "@/features/items/quiz/quizRun";
import { summaryFromCompletionSnapshot } from "@/features/guestHistory/guestHistoryStorage";

/**
 * Authenticated study history (issue #114, AC 3.6.14). Converts the immutable completion snapshot
 * into the API request; the run ID is the server-side idempotency key, so retries are safe.
 */
export function toRecordRequest(snapshot: QuizCompletionSnapshot): RecordStudySessionRequest | null {
  const summary = summaryFromCompletionSnapshot(snapshot);
  if (!summary) return null;
  const correctItemIds = [...(snapshot.correctItemIds ?? [])];
  // Only a consistent list is sent: the server rejects ids that exceed the score or overlap the misses.
  const missed = new Set(summary.missedItemIds);
  const sendCorrectIds =
    correctItemIds.length > 0 &&
    correctItemIds.length <= summary.correct &&
    correctItemIds.length <= 1000 &&
    new Set(correctItemIds).size === correctItemIds.length &&
    !correctItemIds.some((id) => missed.has(id));
  return {
    runId: summary.runId,
    completedAt: summary.completedAt,
    correct: summary.correct,
    total: summary.total,
    source: summary.source,
    missedItemIds: summary.missedItemIds,
    mode: summary.mode,
    ...(sendCorrectIds ? { correctItemIds } : {}),
  };
}

const RETRY_DELAYS_MS = [1000, 4000];

/** Saves a completed run for a signed-in user. Retries transient failures; never throws or blocks gameplay. */
export async function recordAuthenticatedCompletion(
  snapshot: QuizCompletionSnapshot,
  delaysMs: number[] = RETRY_DELAYS_MS,
): Promise<boolean> {
  const request = toRecordRequest(snapshot);
  if (!request) return false;
  return saveStudySession(request, delaysMs);
}

/** Saves any prepared run (for example a daily quiz with no browsable source). Same retries; never throws. */
export async function saveStudySession(
  request: RecordStudySessionRequest,
  delaysMs: number[] = RETRY_DELAYS_MS,
): Promise<boolean> {
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      await studySessionsApi.record(request);
      return true;
    } catch {
      if (attempt === delaysMs.length) return false;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
  return false;
}
