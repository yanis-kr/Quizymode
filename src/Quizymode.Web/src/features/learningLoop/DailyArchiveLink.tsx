import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { dailyQuizApi } from "@/api/learningLoop";

/** #677: entry point to the daily archive; rendered only when at least one archive set exists. */
export function DailyArchiveLink({ identityKey }: { identityKey: string }) {
  const query = useQuery({
    queryKey: ["daily-quiz-archive", identityKey],
    queryFn: () => dailyQuizApi.archive(),
    retry: false,
    staleTime: 60 * 1000,
  });
  if (!query.data || query.data.days.length === 0) return null;
  return (
    <p className="mb-3 text-sm">
      <Link to="/daily/archive" className="font-semibold text-indigo-ink underline">
        Missed a day? Play earlier daily quizzes
      </Link>
    </p>
  );
}
