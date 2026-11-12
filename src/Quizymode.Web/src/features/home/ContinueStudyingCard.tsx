import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { readResumeEntry, removeResumeEntry, type StoredResumeEntry } from "@/features/items/quiz/resumeStorage";
import { ResumeChoice } from "@/features/items/quiz/ResumeChoice";

function clearSessionRun(runId: string): void {
  try {
    const raw = sessionStorage.getItem("navigationContext_quiz");
    if (!raw) return;
    const parsed = JSON.parse(raw) as { quizRun?: { runId?: unknown } } | null;
    if (parsed?.quizRun?.runId === runId) sessionStorage.removeItem("navigationContext_quiz");
  } catch {
    // Storage is optional.
  }
}

/**
 * Home "Continue studying" card (AC 3.6.24): shown when this identity has a saved unfinished Quiz or Test run.
 * Waits for auth to settle, and only ever reads or clears the current identity's entry.
 */
export function ContinueStudyingCard() {
  const { isAuthenticated, isLoading, userId } = useAuth();
  const navigate = useNavigate();
  const identityKey = isAuthenticated ? `user:${userId ?? "unknown"}` : "guest";
  const [dismissedRunId, setDismissedRunId] = useState<string | null>(null);
  if (isLoading) return null;
  const entry: StoredResumeEntry | null = readResumeEntry(identityKey);
  if (!entry || entry.run.runId === dismissedRunId) return null;

  return (
    <ResumeChoice
      variant="home"
      entry={entry}
      onResume={() => navigate(entry.resumePath, { state: { quizResume: "resume" } })}
      onStartOver={() => {
        // Start over discards the unfinished run (never recorded as completed) and opens a fresh run of the scope.
        removeResumeEntry(identityKey, entry.run.runId);
        clearSessionRun(entry.run.runId);
        setDismissedRunId(entry.run.runId);
        navigate(entry.startPath);
      }}
    />
  );
}
