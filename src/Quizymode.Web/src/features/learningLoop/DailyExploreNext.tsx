import { ExploreNextTiles } from "@/components/study/ExploreNextTiles";
import { useExploreNextSets } from "./useExploreNextSets";

/** "Explore next" under the Daily result and the Daily done card (#649): three quick quizzes, or nothing. */
export function DailyExploreNext() {
  const { tiles, isLoading } = useExploreNextSets(3);
  return <ExploreNextTiles heading="Explore next" tiles={tiles} loading={isLoading} />;
}
