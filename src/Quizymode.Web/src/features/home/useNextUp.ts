import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { dailyQuizApi, reviewQueueApi } from "@/api/learningLoop";
import { studySessionsApi } from "@/api/studySessions";
import { readGuestHistory, readGuestRunSummary } from "@/features/guestHistory/guestHistoryStorage";
import { buildGuestPracticePath, describeGuestTopic } from "@/features/guestHistory/guestHistoryLinks";
import { readResumeEntry } from "@/features/items/quiz/resumeStorage";
import { readDailyCompletions, utcToday } from "@/features/learningLoop/localLearningState";
import { readLocalReviewList } from "@/features/learningLoop/localReviewList";
import { DAILY_QUIZ_QUERY_KEY } from "@/features/learningLoop/pages/DailyQuizPage";
import { useLocalVersion } from "@/features/interests/useInterests";
import { chooseNextUp, type NextUpChoice, type NextUpInputs } from "./nextUp";

/**
 * Resolves the Next up choice for this visitor from sources that already exist on Home (#670). Returns null (first-visit
 * hero) when no quiz was completed, and while a signed-in visitor's history is still loading.
 */
export function useNextUp(): NextUpChoice | null {
  const { isAuthenticated, isLoading: isAuthLoading, userId } = useAuth();
  const localVersion = useLocalVersion();
  const signedIn = isAuthenticated && !isAuthLoading;
  const identityKey = signedIn ? `user:${userId ?? "unknown"}` : "guest";

  // Same query keys as PersonalizedLanes, so each request is shared rather than repeated.
  const sessionsQuery = useQuery({
    queryKey: ["home", "sessions", userId],
    queryFn: () => studySessionsApi.list(20),
    enabled: signedIn,
    retry: false,
  });
  const reviewQuery = useQuery({
    queryKey: ["review-queue", "summary", userId],
    queryFn: () => reviewQueueApi.getSummary(),
    enabled: signedIn,
    retry: false,
  });
  const dailyQuery = useQuery({
    queryKey: [...DAILY_QUIZ_QUERY_KEY, identityKey],
    queryFn: () => dailyQuizApi.get(),
    enabled: signedIn,
    retry: false,
    staleTime: 60 * 1000,
  });

  const pending = signedIn && (sessionsQuery.isLoading || reviewQuery.isLoading || dailyQuery.isLoading);

  return useMemo(() => {
    if (isAuthLoading || pending) return null;
    const runs = signedIn
      ? (sessionsQuery.data ?? [])
          .map((session) => readGuestRunSummary(session))
          .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
      : readGuestHistory();
    const lastWithSource = runs.find((run) => run.source !== null);
    const resumeEntry = readResumeEntry(identityKey);
    const inputs: NextUpInputs = {
      completedQuiz: runs.length > 0,
      signedIn,
      dailyDone: signedIn
        ? dailyQuery.data
          ? dailyQuery.data.completion !== null
          : null
        : readDailyCompletions().some((entry) => entry.date === utcToday()),
      // Guests have no due schedule, so their browser-local saved list stands in for "due".
      reviewCount: signedIn ? (reviewQuery.data ? reviewQuery.data.dueCount : null) : readLocalReviewList().length,
      resume: resumeEntry ? { path: resumeEntry.resumePath, label: resumeEntry.label } : null,
      lastTopic: lastWithSource?.source ? { source: lastWithSource.source, mode: lastWithSource.mode } : null,
    };
    return chooseNextUp(inputs);
    // localVersion re-reads browser-local sources after storage changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, pending, signedIn, identityKey, sessionsQuery.data, reviewQuery.data, dailyQuery.data, localVersion]);
}

interface NextUpView {
  title: string;
  detail: string;
  action: string;
  to: string;
  state?: unknown;
}

export function describeNextUp(choice: NextUpChoice): NextUpView {
  switch (choice.kind) {
    case "daily":
      return { title: "Today's daily quiz", detail: "A new quiz is ready. Keep your streak going.", action: "Play the daily quiz", to: "/daily" };
    case "review":
      return {
        title: "Review your mistakes",
        detail: choice.signedIn
          ? `${choice.count} ${choice.count === 1 ? "question is" : "questions are"} due for review.`
          : `${choice.count} ${choice.count === 1 ? "question" : "questions"} saved in this browser.`,
        action: "Review mistakes",
        to: "/review",
      };
    case "resume":
      return {
        title: "Pick up where you left off",
        detail: `You have an unfinished session: ${choice.label}.`,
        action: "Resume",
        to: choice.path,
        state: { quizResume: "resume" },
      };
    case "topic": {
      const label = choice.source.kind === "collection" ? "your last collection" : describeGuestTopic(choice.source);
      return {
        title: "Keep going",
        detail: `Fresh questions from ${label}.`,
        action: choice.mode === "learn" ? "Learn more" : "Play the next topic",
        to: buildGuestPracticePath(choice.source, choice.mode),
      };
    }
    case "start":
      return { title: "Keep going", detail: "Five quick questions on something new.", action: "Play a 5-question quiz", to: "/start" };
  }
}
