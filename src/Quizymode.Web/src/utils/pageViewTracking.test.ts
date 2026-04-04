import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPageViewSessionId, shouldTrackPageView } from "./pageViewTracking";

describe("pageViewTracking", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates and reuses a session identifier", () => {
    vi.stubGlobal(
      "crypto",
      { randomUUID: vi.fn(() => "session-123") } as unknown as Crypto
    );

    expect(getPageViewSessionId()).toBe("session-123");
    expect(getPageViewSessionId()).toBe("session-123");
    expect(sessionStorage.getItem("quizymode.analytics.session-id")).toBe(
      "session-123"
    );
  });

  it("falls back to an in-memory session id when sessionStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    const firstId = getPageViewSessionId();
    const secondId = getPageViewSessionId();

    expect(firstId).toBeTruthy();
    expect(secondId).toBe(firstId);
  });

  it("suppresses duplicate page views inside the duplicate window", () => {
    expect(shouldTrackPageView("/quiz", "?page=1")).toBe(true);
    expect(shouldTrackPageView("/quiz", "?page=1")).toBe(false);

    vi.advanceTimersByTime(1600);

    expect(shouldTrackPageView("/quiz", "?page=1")).toBe(true);
  });

  it("tracks different markers independently and tolerates storage failures", () => {
    expect(shouldTrackPageView("/quiz", "?page=1")).toBe(true);
    expect(shouldTrackPageView("/quiz", "?page=2")).toBe(true);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(shouldTrackPageView("/explore", "")).toBe(true);
  });
});
