import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { TopicSuggestion } from "@/api/taxonomy";
import { useTopicSuggestionAnalytics } from "./topicSuggestionAnalytics";

const { mockTrackEvent } = vi.hoisted(() => ({ mockTrackEvent: vi.fn() }));

vi.mock("@/features/analytics/analyticsEvents", () => ({
  trackEvent: mockTrackEvent,
  createAnalyticsId: () => "run-1",
}));

const chip = (l2: string, reason: TopicSuggestion["reason"] = "text"): TopicSuggestion => ({
  categorySlug: "tech",
  l1: "ai-ml",
  l2,
  path: `tech › ai-ml › ${l2}`,
  description: "",
  score: 0,
  matchedTerms: [],
  reason,
});

const saved = (l2: string, isPrivate: boolean) => ({
  category: "tech",
  rank1: "ai-ml",
  rank2: l2,
  isPrivate,
});

describe("useTopicSuggestionAnalytics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends nothing while the user works, and nothing on save when no chip was ever shown", () => {
    // AC 5.4.12
    const { result } = renderHook(() => useTopicSuggestionAnalytics());
    result.current.onSaved(saved("nlp", false));
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("sends nothing before the save even when chips were shown", () => {
    const { result } = renderHook(() => useTopicSuggestionAnalytics());
    result.current.onSuggestionsShown([chip("one"), chip("two")]);
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("sends shown and accepted with the chip position when the saved path is a shown chip", () => {
    // AC 5.4.12
    const { result } = renderHook(() => useTopicSuggestionAnalytics());
    result.current.onSuggestionsShown([chip("one"), chip("two"), chip("three")]);
    result.current.onSaved(saved("two", false));

    expect(mockTrackEvent).toHaveBeenCalledTimes(2);
    expect(mockTrackEvent).toHaveBeenNthCalledWith(1, {
      name: "topic_suggestion_shown",
      contextType: "topic",
      contextId: "text",
      runId: "run-1",
      total: 3,
    });
    expect(mockTrackEvent).toHaveBeenNthCalledWith(2, {
      name: "topic_suggestion_accepted",
      contextType: "topic",
      contextId: "tech/ai-ml/two",
      runId: "run-1",
      position: 2,
    });
  });

  it("counts a shown chip picked through the picker as accepted", () => {
    const { result } = renderHook(() => useTopicSuggestionAnalytics());
    result.current.onSuggestionsShown([chip("one"), chip("two")]);
    result.current.onSaved(saved("one", false));
    expect(mockTrackEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "topic_suggestion_accepted", position: 1 })
    );
  });

  it("sends overridden with the saved path when it is not a shown chip", () => {
    // AC 5.4.12
    const { result } = renderHook(() => useTopicSuggestionAnalytics());
    result.current.onSuggestionsShown([chip("one", "popular")]);
    result.current.onSaved(saved("elsewhere", false));

    expect(mockTrackEvent).toHaveBeenCalledTimes(2);
    expect(mockTrackEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: "topic_suggestion_shown", contextId: "popular", total: 1 }));
    expect(mockTrackEvent).toHaveBeenNthCalledWith(2, {
      name: "topic_suggestion_overridden",
      contextType: "topic",
      contextId: "tech/ai-ml/elsewhere",
      runId: "run-1",
    });
  });

  it("omits the context id when the saved item is private", () => {
    // AC 5.4.12
    const accepted = renderHook(() => useTopicSuggestionAnalytics());
    accepted.result.current.onSuggestionsShown([chip("one")]);
    accepted.result.current.onSaved(saved("one", true));
    expect(mockTrackEvent).toHaveBeenLastCalledWith({
      name: "topic_suggestion_accepted",
      contextType: "topic",
      runId: "run-1",
      position: 1,
    });

    const overridden = renderHook(() => useTopicSuggestionAnalytics());
    overridden.result.current.onSuggestionsShown([chip("one")]);
    overridden.result.current.onSaved(saved("other", true));
    expect(mockTrackEvent).toHaveBeenLastCalledWith({
      name: "topic_suggestion_overridden",
      contextType: "topic",
      runId: "run-1",
    });
  });

  it("reports at most once per form session, with the total of the first chips shown", () => {
    const { result } = renderHook(() => useTopicSuggestionAnalytics());
    result.current.onSuggestionsShown([chip("one"), chip("two")]);
    result.current.onSuggestionsShown([chip("three")]);
    result.current.onSaved(saved("three", false));
    result.current.onSaved(saved("three", false));

    expect(mockTrackEvent).toHaveBeenCalledTimes(2);
    expect(mockTrackEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ total: 2 }));
    expect(mockTrackEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ position: 1 }));
  });

  it("never puts text in any payload", () => {
    const { result } = renderHook(() => useTopicSuggestionAnalytics());
    result.current.onSuggestionsShown([chip("one")]);
    result.current.onSaved(saved("other", false));
    for (const [payload] of mockTrackEvent.mock.calls) {
      expect(Object.keys(payload).sort()).toEqual(
        expect.arrayContaining(["name", "contextType", "runId"])
      );
      expect(JSON.stringify(payload)).not.toMatch(/question|answer|text":/i);
    }
  });
});
