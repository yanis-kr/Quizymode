import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import {
  flushAnalyticsEvents,
  flushDeferredAnalyticsEvents,
  resetAnalyticsEventsForTests,
  sendPendingOnPageHideForTests,
  trackEvent,
  trackEventDeferredOnce,
  trackEventOnce,
} from "./analyticsEvents";
import { useTrackEventOnce } from "./useTrackEventOnce";

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage;
}

const { mockTrackEvents, mockIsInternalBrowser } = vi.hoisted(() => ({
  mockTrackEvents: vi.fn(),
  mockIsInternalBrowser: vi.fn(() => false),
}));

vi.mock("@/api/analytics", () => ({
  analyticsApi: { trackEvents: mockTrackEvents },
}));

vi.mock("@/utils/pageViewTracking", () => ({
  getPageViewSessionId: () => "session-1",
  isInternalBrowser: mockIsInternalBrowser,
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
    mockIsInternalBrowser.mockReset();
    mockIsInternalBrowser.mockReturnValue(false);
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

  it("sends the internal marker only from a browser marked as internal", async () => {
    mockIsInternalBrowser.mockReturnValue(true);
    trackEvent({ name: "quick_quiz_started", runId: "run-1" });

    await waitFor(() => expect(mockTrackEvents).toHaveBeenCalledTimes(1));
    expect(mockTrackEvents.mock.calls[0][0]).toMatchObject({ sessionId: "session-1", internalBrowser: true });
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

describe("analyticsEvents deferred batching", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetAnalyticsEventsForTests();
    mockTrackEvents.mockReset();
    mockIsInternalBrowser.mockReset();
    mockIsInternalBrowser.mockReturnValue(false);
    mockTrackEvents.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("holds deferred events until the batch size is reached", async () => {
    for (let i = 0; i < 4; i += 1) {
      trackEventDeferredOnce(`run-1:item-${i}`, { name: "question_answered", runId: "run-1" });
    }
    await Promise.resolve();
    expect(mockTrackEvents).not.toHaveBeenCalled();

    trackEventDeferredOnce("run-1:item-4", { name: "question_answered", runId: "run-1" });
    await waitFor(() => expect(mockTrackEvents).toHaveBeenCalledTimes(1));
    expect(mockTrackEvents.mock.calls[0][0].events).toHaveLength(5);
  });

  it("ignores a repeated onceKey instead of queuing it again", async () => {
    trackEventDeferredOnce("run-1:item-0", { name: "question_answered", runId: "run-1" });
    trackEventDeferredOnce("run-1:item-0", { name: "question_answered", runId: "run-1" });
    flushDeferredAnalyticsEvents();

    await waitFor(() => expect(mockTrackEvents).toHaveBeenCalledTimes(1));
    expect(mockTrackEvents.mock.calls[0][0].events).toHaveLength(1);
  });

  it("sends nothing on an explicit flush when nothing is deferred", async () => {
    flushDeferredAnalyticsEvents();
    await flushAnalyticsEvents();
    expect(mockTrackEvents).not.toHaveBeenCalled();
  });

  it("flushes fewer than the batch size via flushDeferredAnalyticsEvents", async () => {
    trackEventDeferredOnce("run-1:item-0", { name: "question_answered", runId: "run-1" });
    trackEventDeferredOnce("run-1:item-1", { name: "question_answered", runId: "run-1" });
    flushDeferredAnalyticsEvents();

    await waitFor(() => expect(mockTrackEvents).toHaveBeenCalledTimes(1));
    expect(mockTrackEvents.mock.calls[0][0].events).toHaveLength(2);
  });
});

describe("analyticsEvents page-hide delivery", () => {
  let storage: Storage;

  beforeEach(() => {
    sessionStorage.clear();
    resetAnalyticsEventsForTests();
    mockTrackEvents.mockReset();
    mockIsInternalBrowser.mockReset();
    mockIsInternalBrowser.mockReturnValue(false);
    storage = createStorage();
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends held deferred events with a keepalive fetch and the bearer token", () => {
    storage.setItem("idToken", "token-abc");
    trackEventDeferredOnce("run-1:item-0", { name: "question_answered", runId: "run-1" });

    sendPendingOnPageHideForTests();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/\/analytics\/events$/);
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.headers.Authorization).toBe("Bearer token-abc");
    const body = JSON.parse(init.body);
    expect(body.events).toHaveLength(1);
  });

  it("omits the Authorization header when no token is stored", () => {
    trackEventDeferredOnce("run-1:item-0", { name: "question_answered", runId: "run-1" });

    sendPendingOnPageHideForTests();

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("does nothing when there is nothing pending", () => {
    sendPendingOnPageHideForTests();
    expect(fetch).not.toHaveBeenCalled();
  });
});
