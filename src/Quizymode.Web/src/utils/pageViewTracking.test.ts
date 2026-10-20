import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTERNAL_BROWSER_STORAGE_KEY,
  getPageViewSessionId,
  isAdminPath,
  isAuthCallbackPath,
  isInternalBrowser,
  setInternalBrowser,
  shouldTrackPageView,
  stripOAuthParams,
} from "./pageViewTracking";
import { installMemoryLocalStorage } from "@/test/memoryStorage";

describe("pageViewTracking", () => {
  let storage: Storage;

  beforeEach(() => {
    sessionStorage.clear();
    storage = installMemoryLocalStorage();
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

  it("stores, reads, and clears the internal-browser marker in localStorage", () => {
    expect(isInternalBrowser()).toBe(false);

    setInternalBrowser(true);
    expect(storage.getItem(INTERNAL_BROWSER_STORAGE_KEY)).toBe("true");
    expect(isInternalBrowser()).toBe(true);

    setInternalBrowser(false);
    expect(storage.getItem(INTERNAL_BROWSER_STORAGE_KEY)).toBeNull();
    expect(isInternalBrowser()).toBe(false);
  });

  it("treats blocked storage as an unmarked browser without throwing", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(() => setInternalBrowser(true)).not.toThrow();
    expect(isInternalBrowser()).toBe(false);
  });

  it("recognizes admin routes only", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/page-view-analytics")).toBe(true);
    expect(isAdminPath("/administrator-guide")).toBe(false);
    expect(isAdminPath("/categories/admin")).toBe(false);
  });
});

describe("OAuth redirect parameters", () => {
  it("strips code, state, error and error_description but keeps other parameters", () => {
    expect(stripOAuthParams("?code=abc&state=xyz")).toBe("");
    expect(stripOAuthParams("?error=access_denied&error_description=nope&sort=popular")).toBe("?sort=popular");
    expect(stripOAuthParams("?utm_source=news&code=1")).toBe("?utm_source=news");
    expect(stripOAuthParams("")).toBe("");
  });

  it("recognizes the callback path", () => {
    expect(isAuthCallbackPath("/auth/callback")).toBe(true);
    expect(isAuthCallbackPath("/auth/callbackx")).toBe(false);
    expect(isAuthCallbackPath("/login")).toBe(false);
  });
});
