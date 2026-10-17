import { studySessionsApi, type ImportGuestStudySessionsResponse } from "@/api/studySessions";
import { trackEventOnce } from "@/features/analytics/analyticsEvents";
import { clearGuestHistory, readGuestHistory } from "./guestHistoryStorage";

export const GUEST_IMPORT_VERSION = 1;

export type ClaimGuestProgressResult =
  | { status: "none" }
  | { status: "saved"; saved: number; skipped: number }
  | { status: "failed"; pending: number };

/**
 * Claims browser-local guest history for the signed-in user (issue #115, AC 3.6.16).
 * Sends a versioned payload; the server is idempotent per run ID, so retries are safe. Guest storage is
 * cleared only after the server confirms the whole import; any failure keeps it for a later retry.
 */
export async function claimGuestProgress(): Promise<ClaimGuestProgressResult> {
  const summaries = readGuestHistory();
  if (summaries.length === 0) return { status: "none" };

  let response: ImportGuestStudySessionsResponse;
  try {
    response = await studySessionsApi.importGuest({
      version: GUEST_IMPORT_VERSION,
      runs: summaries.map((summary) => ({
        runId: summary.runId,
        completedAt: summary.completedAt,
        correct: summary.correct,
        total: summary.total,
        source: summary.source,
        missedItemIds: summary.missedItemIds,
      })),
    });
  } catch {
    return { status: "failed", pending: summaries.length };
  }

  clearGuestHistory();
  const saved = response.imported + response.duplicates;
  if (saved > 0) {
    // Funnel step (AC 5.4.10): once per tab session, auth context only, no counts or run data.
    trackEventOnce("imported", { name: "guest_state_imported", contextType: "auth" });
  }

  return {
    status: "saved",
    saved,
    skipped: response.rejectedRunIds.length,
  };
}
