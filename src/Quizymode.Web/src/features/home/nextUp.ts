import type { GuestHistorySource } from "@/features/guestHistory/guestHistoryStorage";

/**
 * Home "Next up" card selection (#670, AC 3.31). Pure so the priority order is unit-testable.
 * Order: Daily not done today, mistakes due for review, unfinished session, next set in the last topic.
 */
export interface NextUpInputs {
  /** True when this identity has completed at least one quiz or learn run. */
  completedQuiz: boolean;
  /** Null while unknown (loading or failed); an unknown source is skipped, never assumed. */
  dailyDone: boolean | null;
  /** Mistakes ready to review: the due count when signed in, the saved count for guests. Null when unknown. */
  reviewCount: number | null;
  signedIn: boolean;
  resume: { path: string; label: string } | null;
  lastTopic: { source: GuestHistorySource; mode: "quiz" | "learn" } | null;
}

export type NextUpChoice =
  | { kind: "daily" }
  | { kind: "review"; count: number; signedIn: boolean }
  | { kind: "resume"; path: string; label: string }
  | { kind: "topic"; source: GuestHistorySource; mode: "quiz" | "learn" }
  | { kind: "start" };

/** Null means the visitor has not completed a quiz, so Home keeps the first-visit hero (AC 3.31.4). */
export function chooseNextUp(inputs: NextUpInputs): NextUpChoice | null {
  if (!inputs.completedQuiz) return null;
  if (inputs.dailyDone === false) return { kind: "daily" };
  if (inputs.reviewCount !== null && inputs.reviewCount > 0) {
    return { kind: "review", count: inputs.reviewCount, signedIn: inputs.signedIn };
  }
  if (inputs.resume) return { kind: "resume", path: inputs.resume.path, label: inputs.resume.label };
  if (inputs.lastTopic) return { kind: "topic", source: inputs.lastTopic.source, mode: inputs.lastTopic.mode };
  return { kind: "start" };
}
