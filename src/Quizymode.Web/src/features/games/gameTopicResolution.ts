import { isTopicPath, mergeTopics } from "@/features/interests/topicPaths";
import type { InterestsStatus } from "@/features/interests/useInterests";

export type GameTopicResolution =
  | { mode: "explicit" | "all" }
  | { mode: "topics"; topics: string[] }
  | { mode: "choose" | "loading" | "error" };

/** Activity-derived defaults can be added by #385; inference must never broaden an explicit preference. */
export function resolveGameTopics(explicit: boolean, all: boolean, status: InterestsStatus, interests: string[]): GameTopicResolution {
  if (explicit) return { mode: "explicit" };
  if (all) return { mode: "all" };
  if (status === "loading") return { mode: "loading" };
  if (status === "error") return { mode: "error" };
  const topics = mergeTopics([], interests.filter(isTopicPath));
  return topics.length ? { mode: "topics", topics } : { mode: "choose" };
}
