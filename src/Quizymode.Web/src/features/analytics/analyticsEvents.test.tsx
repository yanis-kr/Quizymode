import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import {
  flushAnalyticsEvents,
  resetAnalyticsEventsForTests,
  trackEvent,
  trackEventOnce,
} from "./analyticsEvents";
import { useTrackEventOnce } from "./useTrackEventOnce";

const { mockTrackEvents } = vi.hoisted(() => ({ mockTrackEvents: vi.fn() }));

vi.mock("@/api/analytics", () => ({
  analyticsApi: { trackEvents: mockTrackEvents },
}));

vi.mock("@/utils/pageViewTracking", () => ({
  getPageViewSessionId: () => "session-1",
}));

function PromptImpression({ promptId }: { promptId: string }) {
  useTrackEventOnce(promptId, {
    name: "signup_prompt_viewed",
    contextType: "quiz",
    contextId: "results",
  });
  return <div>prompt</div>;
}

describe("analyticsEvents", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetAnalyticsEventsForTests();
    mockTrackEvents.mockReset();
    mockTrackEvents.mockResolvedValue(undefined);
    window.history.replaceState(null, "", "/quiz/science?item=abc");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("batches events queued in the same tick with the page session and app-relative path", async () => {
    trackEvent({ name: "quick_quiz_started", runId: "run-1", total: 10, contextType: "home" });
    trackEvent({ name: "quiz_completed", runId: "run-1", score: 7, total: 10 });

    await waitFor(() => expect(mockTrackEvents).toHaveBeenCalledTimes(1));
    expect(mockTrackEvents).toHaveBeenCalledWith({
      sessionId: "session-1",
      events: [
        { name: "quick_quiz_started", path: "/quiz/science", contextType: "home", runId: "run-1", total: 10 },
        { name: "quiz_completed", path: "/quiz/science", runId: "run-1", score: 7, total: 10 },
      ],
    });
  });

  it("never sends a context id without its context type", async () => {
    trackEvent({ name: "signup_submitted", contextId: "orphan" });

    await waitFor(() => expect(mockTrackEvents).toHaveBeenCalledTimes(1));
    expect(mockTrackEvents.mock.calls[0][0].events[0]).toEqual({
      name: "signup_submitted",
      path: "/quiz/science",
    });
  });

  it("splits large bursts into batches of at most 25", async () => {
    for (let index = 0; index < 30; index += 1) {
      trackEvent({ name: "signup_form_started" });
    }

    await waitFor(() => expect(mockTrackEvents).toHaveBeenCalledTimes(2));
    expect(mockTrackEvents.mock.calls[0][0].events).toHaveLength(25);
    expect(mockTrackEvents.mock.calls[1][0].events).toHaveLength(5);
  });

  it("swallows delivery failures without throwing or retrying", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    mockTrackEvents.mockRejectedValue(new Error("network down"));

    expect(() => trackEvent({ name: "signup_submitted" })).not.toThrow();
    await flushAnalyticsEvents();

    await waitFor(() => expect(debug).toHaveBeenCalled());
    expect(mockTrackEvents).toHaveBeenCalledTimes(1);
  });

  it("sends a keyed impression once per tab session and passes the key as the idempotency id", async () => {
    trackEventOnce("results-prompt-1", { name: "signup_prompt_viewed" });
    trackEventOnce("results-prompt-1", { name: "signup_prompt_viewed" });
    trackEventOnce("results-prompt-1", { name: "signup_prompt_clicked" });

    await waitFor(() => expect(mockTrackEvents).toHaveBeenCalledTimes(1));
    expect(mockTrackEvents.mock.calls[0][0].events).toEqual([
      { name: "signup_prompt_viewed", path: "/quiz/science", clientEventId: "results-prompt-1" },
      { name: "signup_prompt_clicked", path: "/quiz/science", clientEventId: "results-prompt-1" },
    ]);

    // A full reload keeps the tab session, so the impression stays deduped.
    resetAnalyticsEventsForTests();
    trackEventOnce("results-prompt-1", { name: "signup_prompt_viewed" });
    await flushAnalyticsEvents();
    expect(mockTrackEvents).toHaveBeenCalledTimes(1);
  });

  it("dedupes locally but omits the idempotency id when the key is not a short token", async () => {
    trackEventOnce("has spaces in it", { name: "signup_prompt_viewed" });

    await waitFor(() => expect(mockTrackEvents).toHaveBeenCalledTimes(1));
    expect(mockTrackEvents.mock.calls[0][0].events[0]).not.toHaveProperty("clientEventId");
  });

  it("records a component impression once despite StrictMode double effects and remounts", async () => {
    const { unmount } = render(
      <StrictMode>
        <PromptImpression promptId="prompt-a" />
      </StrictMode>
    );
    unmount();
    render(<PromptImpression promptId="prompt-a" />);

    await waitFor(() => expect(mockTrackEvents).toHaveBeenCalledTimes(1));
    await flushAnalyticsEvents();
    expect(mockTrackEvents).toHaveBeenCalledTimes(1);
    expect(mockTrackEvents.mock.calls[0][0].events).toHaveLength(1);
    expect(mockTrackEvents.mock.calls[0][0].events[0]).toMatchObject({
      name: "signup_prompt_viewed",
      contextType: "quiz",
      contextId: "results",
      clientEventId: "prompt-a",
    });
  });
});
