export type TopicScopePatch = Partial<{
  category: string;
  rank1: string;
  rank2: string;
}>;

export interface TopicScope {
  category: string;
  rank1: string;
  rank2: string;
}

/** The copy every parent shows when it blocks a submit because the topic is incomplete (AC 12.14). */
export const TOPIC_REQUIRED_MESSAGE = "Choose a topic: pick a suggestion, search, or browse all topics.";

/**
 * Applies a patch the way the selects always did: changing the category clears the L1 and L2, changing the L1 clears
 * the L2, unless the patch also carries the lower levels (a chip or picker choice sets all three at once).
 */
export function applyTopicScopePatch(current: TopicScope, patch: TopicScopePatch): TopicScope {
  if (patch.category !== undefined) {
    return { category: patch.category, rank1: patch.rank1 ?? "", rank2: patch.rank2 ?? "" };
  }
  if (patch.rank1 !== undefined) {
    return { ...current, rank1: patch.rank1, rank2: patch.rank2 ?? "" };
  }
  if (patch.rank2 !== undefined) {
    return { ...current, rank2: patch.rank2 };
  }
  return current;
}

/** True when the three values name a complete topic (the parents' JS replacement for the old `required`). */
export function isTopicComplete(scope: TopicScope): boolean {
  return scope.category.trim() !== "" && scope.rank1.trim() !== "" && scope.rank2.trim() !== "";
}
