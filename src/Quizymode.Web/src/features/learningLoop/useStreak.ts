import { useQuery } from "@tanstack/react-query";
import { dailyQuizApi } from "@/api/learningLoop";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalVersion } from "@/features/interests/useInterests";
import { computeStreak, readDailyCompletions, utcToday } from "./localLearningState";
import { DAILY_QUIZ_QUERY_KEY } from "./dailyQuizQueryKey";

/** Current daily streak and whether today's daily is done: account data when signed in, this browser otherwise (#671). */
export function useStreak(): { streak: number; playedToday: boolean } {
  const { isAuthenticated, isLoading, userId } = useAuth();
  const signedIn = isAuthenticated && !isLoading;
  useLocalVersion();
  const query = useQuery({
    queryKey: [...DAILY_QUIZ_QUERY_KEY, isAuthenticated ? `user:${userId ?? "unknown"}` : "guest"],
    queryFn: () => dailyQuizApi.get(),
    enabled: signedIn,
    retry: false,
    staleTime: 60 * 1000,
  });
  if (signedIn) return { streak: query.data?.streak ?? 0, playedToday: Boolean(query.data?.completion) };
  const today = utcToday();
  const dates = readDailyCompletions().map((entry) => entry.date);
  return { streak: computeStreak(dates, today), playedToday: dates.includes(today) };
}
