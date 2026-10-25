import { useCallback, useRef } from "react";
import type { TopicSuggestion } from "@/api/taxonomy";
import { createAnalyticsId, trackEvent } from "@/features/analytics/analyticsEvents";

const MAX_REPORTED = 500;

export interface SavedTopic {
  category: string;
  rank1: string;
  rank2: string;
  /** A private choice of topic is not recorded: the path is omitted from accepted/overridden. */
  isPrivate: boolean;
}

function pathKey(category: string, l1: string, l2: string): string {
  return `${category}/${l1}/${l2}`.toLowerCase();
}

/**
 * Topic suggestion analytics for one form session (AC 5.4.12). Nothing is sent while the user works: the chips shown
 * are remembered, and one successful save sends `topic_suggestion_shown` plus exactly one of
 * `topic_suggestion_accepted` (the saved path is a chip that was shown) or `topic_suggestion_overridden`. No event
 * carries text. Nothing is sent when no chip was ever shown.
 */
export function useTopicSuggestionAnalytics() {
  const runId = useRef<string | null>(null);
  const shown = useRef<Map<string, number>>(new Map());
  const first = useRef<{ total: number; reason: TopicSuggestion["reason"] } | null>(null);
  const reported = useRef(false);

  const onSuggestionsShown = useCallback((suggestions: TopicSuggestion[]) => {
    if (suggestions.length === 0) return;
    if (!first.current) {
      first.current = { total: suggestions.length, reason: suggestions[0].reason };
    }
    suggestions.forEach((suggestion, index) => {
      shown.current.set(pathKey(suggestion.categorySlug, suggestion.l1, suggestion.l2), index + 1);
    });
  }, []);

  const onSaved = useCallback((saved: SavedTopic) => {
    if (reported.current || !first.current) return;
    reported.current = true;

    const id = (runId.current ??= createAnalyticsId());
    const path = `${saved.category.trim()}/${saved.rank1.trim()}/${saved.rank2.trim()}`;
    const position = shown.current.get(pathKey(saved.category.trim(), saved.rank1.trim(), saved.rank2.trim()));
    const contextId = saved.isPrivate ? {} : { contextId: path };

    trackEvent({
      name: "topic_suggestion_shown",
      contextType: "topic",
      contextId: first.current.reason,
      runId: id,
      total: Math.min(first.current.total, MAX_REPORTED),
    });

    if (position !== undefined) {
      trackEvent({
        name: "topic_suggestion_accepted",
        contextType: "topic",
        ...contextId,
        runId: id,
        position: Math.min(position, MAX_REPORTED),
      });
    } else {
      trackEvent({ name: "topic_suggestion_overridden", contextType: "topic", ...contextId, runId: id });
    }
  }, []);

  return { onSuggestionsShown, onSaved };
}
