import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { taxonomyApi, type TopicSuggestion } from "@/api/taxonomy";
import { useAuth } from "@/contexts/AuthContext";
import { TOPIC_SUGGEST_QUERY_ROOT } from "./topicQueryKeys";

/** Typing pauses this long before a request is made. */
export const SUGGEST_DEBOUNCE_MS = 600;
/** Typed text shorter than this makes no request and keeps the chips already shown. */
export const MIN_SUGGEST_TEXT_LENGTH = 20;
/** After a 429 no request is made for this long. */
export const RATE_LIMIT_SUPPRESS_MS = 60_000;
const TEXT_STALE_MS = 5 * 60 * 1000;
const CHIP_LIMIT = 5;

let suppressedUntil = 0;

/** Test hook: forget a previous 429. */
export function resetTopicSuggestionSuppression(): void {
  suppressedUntil = 0;
}

class SuppressedError extends Error {}

/** A short stable key for the text, so the cache key never holds what the user typed (cyrb53). */
export function textKey(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${text.length}:${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

export type SuggestionPhase =
  /** The mount-time "common topics" request is in flight. */
  | "initial"
  /** Text-based suggestions are being fetched and nothing is cached for them yet. */
  | "loading"
  | "ready"
  /** Disabled, failed, rate limited or empty: render nothing. */
  | "hidden";

export interface TopicSuggestionsState {
  suggestions: TopicSuggestion[];
  phase: SuggestionPhase;
  /** The chips shown belong to earlier text while newer text is fetched. */
  isRefreshing: boolean;
}

interface UseTopicSuggestionsOptions {
  /** The composed text (question + answer, notes, ...). Never sent anywhere except the request body. */
  text: string;
  /** False when a topic is selected, or the form has no suggestions. Late responses are then ignored. */
  enabled: boolean;
}

/**
 * Topic chips for the text. One fallback request on mount (empty text, cached for the session), then a request
 * only after a 600 ms pause with at least 20 characters. Any failure is silent; a 429 pauses requests for 60 s.
 */
export function useTopicSuggestions({ text, enabled }: UseTopicSuggestionsOptions): TopicSuggestionsState {
  const { userId } = useAuth();
  const [requestText, setRequestText] = useState("");
  const trimmed = text.trim();

  useEffect(() => {
    if (!enabled) return;
    if (trimmed.length > 0 && trimmed.length < MIN_SUGGEST_TEXT_LENGTH) return;
    const timer = window.setTimeout(() => setRequestText(trimmed), SUGGEST_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed, enabled]);

  const query = useQuery({
    queryKey: [TOPIC_SUGGEST_QUERY_ROOT, userId ?? "anon", textKey(requestText)],
    queryFn: async ({ signal }) => {
      if (Date.now() < suppressedUntil) throw new SuppressedError();
      try {
        const response = await taxonomyApi.suggest(requestText, { limit: CHIP_LIMIT, signal });
        return response.suggestions;
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 429) {
          suppressedUntil = Date.now() + RATE_LIMIT_SUPPRESS_MS;
        }
        throw error;
      }
    },
    enabled,
    staleTime: requestText === "" ? Infinity : TEXT_STALE_MS,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  if (!enabled) {
    return { suggestions: [], phase: "hidden", isRefreshing: false };
  }

  const suggestions = query.data ?? [];
  if (suggestions.length > 0) {
    return { suggestions, phase: "ready", isRefreshing: query.isPlaceholderData };
  }

  if (query.isPending || (query.isFetching && !query.isError)) {
    return { suggestions: [], phase: requestText === "" ? "initial" : "loading", isRefreshing: false };
  }

  return { suggestions: [], phase: "hidden", isRefreshing: false };
}
