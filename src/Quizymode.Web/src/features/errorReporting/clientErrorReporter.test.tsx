import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "@/components/ErrorBoundary";
import {
  MAX_REPORTS_PER_SESSION,
  installClientErrorReporting,
  reportClientError,
  resetClientErrorReporterForTests,
  sanitize,
  type ClientErrorPayload,
} from "./clientErrorReporter";

const { mockGetToken, mockIsInternalBrowser, mockGetVisitorId } = vi.hoisted(() => ({
  mockGetVisitorId: vi.fn<() => string | null>(() => null),
  mockGetToken: vi.fn<() => string | null>(() => null),
  mockIsInternalBrowser: vi.fn(() => false),
}));

vi.mock("@/api/client", () => ({ API_URL: "/api" }));
vi.mock("@/utils/visitorId", () => ({ getVisitorId: mockGetVisitorId }));
vi.mock("@/utils/tokenStorage", () => ({ getToken: mockGetToken }));
vi.mock("@/utils/pageViewTracking", () => ({
  getPageViewSessionId: () => "session-1",
  isInternalBrowser: mockIsInternalBrowser,
}));

const sendBeacon = vi.fn<(url: string, body?: BodyInit | null) => boolean>(() => true);
const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));

function beaconPayloads(): ClientErrorPayload[] {
  return sendBeacon.mock.calls.map(([, body]) => JSON.parse(String(body)) as ClientErrorPayload);
}

function Bomb(): never {
  throw new TypeError("Cannot read properties of undefined (reading 'map')");
}

describe("clientErrorReporter", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetClientErrorReporterForTests();
    sendBeacon.mockReset();
    sendBeacon.mockReturnValue(true);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    mockGetToken.mockReturnValue(null);
    mockIsInternalBrowser.mockReturnValue(false);
    mockGetVisitorId.mockReturnValue(null);
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("__APP_VERSION__", "9.9.9");
    window.history.replaceState(null, "", "/quiz/science?email=someone@example.com#answer");
  });

  afterEach(() => {
    resetClientErrorReporterForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports a render error caught by ErrorBoundary once, with component stack, path, version and session", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/client-errors");
    const [payload] = beaconPayloads();
    expect(payload).toMatchObject({
      source: "boundary",
      name: "TypeError",
      message: "Cannot read properties of undefined (reading 'map')",
      path: "/quiz/science",
      appVersion: "9.9.9",
      sessionId: "session-1",
    });
    expect(payload.componentStack).toContain("Bomb");
    expect(JSON.stringify(payload)).not.toContain("someone@example.com");
    expect(payload.internalBrowser).toBeUndefined();
  });

  it("does not report the OAuth redirect query string from /auth/callback", () => {
    window.history.replaceState(null, "", "/auth/callback?code=secret-code&state=secret-state&error_description=nope");
    installClientErrorReporting();

    window.dispatchEvent(new ErrorEvent("error", { error: new RangeError("bad index"), message: "bad index" }));

    const [payload] = beaconPayloads();
    expect(payload.path).toBe("/auth/callback");
    expect(JSON.stringify(payload)).not.toMatch(/secret-code|secret-state|error_description/);
  });

  it("captures window error events", () => {
    installClientErrorReporting();

    window.dispatchEvent(new ErrorEvent("error", { error: new RangeError("bad index"), message: "bad index" }));

    expect(beaconPayloads()).toEqual([
      expect.objectContaining({ source: "window", name: "RangeError", message: "bad index" }),
    ]);
  });

  it("captures unhandled promise rejections, without serializing non-Error values", () => {
    installClientErrorReporting();

    const withError = Object.assign(new Event("unhandledrejection"), { reason: new Error("load failed") });
    const withObject = Object.assign(new Event("unhandledrejection"), { reason: { email: "x@y.com" } });
    window.dispatchEvent(withError);
    window.dispatchEvent(withObject);

    expect(beaconPayloads()).toEqual([
      expect.objectContaining({ source: "promise", name: "Error", message: "load failed" }),
      expect.objectContaining({
        source: "promise",
        name: "UnhandledRejection",
        message: "Non-Error promise rejection (object)",
      }),
    ]);
  });

  it("sends the visitor id only when one is available", () => {
    mockGetVisitorId.mockReturnValue("0b8a5c1e-2f4d-4c53-9a77-3c1f5d0e9b11");
    reportClientError("window", new Error("first"));
    mockGetVisitorId.mockReturnValue(null);
    reportClientError("window", new Error("second"));

    const [first, second] = beaconPayloads();
    expect(first.visitorId).toBe("0b8a5c1e-2f4d-4c53-9a77-3c1f5d0e9b11");
    expect(second).not.toHaveProperty("visitorId");
  });

  it("captures failed script (chunk) loads without their query strings", () => {
    installClientErrorReporting();
    const script = document.createElement("script");
    script.src = "https://quizymode.test/assets/Quiz-abc123.js?v=1";
    document.body.appendChild(script);

    script.dispatchEvent(new Event("error"));

    expect(beaconPayloads()).toEqual([
      expect.objectContaining({
        source: "window",
        name: "ChunkLoadError",
        message: "Failed to load script https://quizymode.test/assets/Quiz-abc123.js",
      }),
    ]);
    script.remove();
  });

  it("sends the same error only once per tab session, across reloads", () => {
    const error = new Error("same thing");
    reportClientError("window", error);
    reportClientError("window", error);
    resetClientErrorReporterForTests(); // simulates a reload: module memory is gone, sessionStorage is not
    reportClientError("window", error);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it(`stops after ${MAX_REPORTS_PER_SESSION} distinct errors in a tab session`, () => {
    for (let index = 0; index <= MAX_REPORTS_PER_SESSION; index += 1) {
      reportClientError("window", new Error(`distinct ${index}`));
    }

    expect(sendBeacon).toHaveBeenCalledTimes(MAX_REPORTS_PER_SESSION);
    expect(beaconPayloads().map((payload) => payload.message)).not.toContain(`distinct ${MAX_REPORTS_PER_SESSION}`);
  });

  it("ignores cross-origin 'Script error.' and errors whose frames all come from extensions", () => {
    installClientErrorReporting();
    window.dispatchEvent(new ErrorEvent("error", { message: "Script error.", filename: "" }));

    const extensionError = new Error("extension broke");
    extensionError.stack =
      "Error: extension broke\n    at inject (chrome-extension://abcdef/content.js:1:20)\n    at run (moz-extension://1234/x.js:2:3)";
    reportClientError("window", extensionError);

    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("truncates long fields and strips secrets before sending", () => {
    const error = new Error(`token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl ${"x".repeat(900)}`);
    error.stack = `Error: boom\n    at run (https://quizymode.test/assets/a.js?secret=1:1:2)\n${"y".repeat(5000)}`;

    reportClientError("window", error);

    const [payload] = beaconPayloads();
    expect(payload.message.length).toBe(500);
    expect(payload.message).toContain("[token]");
    expect(payload.stack!.length).toBe(4000);
    expect(payload.stack).toContain("https://quizymode.test/assets/a.js:1:2");
    expect(payload.stack).not.toContain("secret");
  });

  it("marks reports from internal browsers", () => {
    mockIsInternalBrowser.mockReturnValue(true);
    reportClientError("window", new Error("internal"));

    expect(beaconPayloads()[0].internalBrowser).toBe(true);
  });

  it("uses a keepalive fetch with the bearer token when signed in", () => {
    mockGetToken.mockReturnValue("signed-in-token");
    reportClientError("promise", new Error("signed in"));

    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/client-errors",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        headers: expect.objectContaining({ Authorization: "Bearer signed-in-token" }),
      })
    );
  });

  it("falls back to fetch when sendBeacon refuses, and never throws when delivery fails", async () => {
    sendBeacon.mockReturnValueOnce(false);
    reportClientError("window", new Error("beacon refused"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    sendBeacon.mockImplementation(() => {
      throw new Error("beacon blew up");
    });
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(() => reportClientError("window", new Error("network failure"))).not.toThrow();

    fetchMock.mockImplementation(() => {
      throw new Error("fetch blew up");
    });
    expect(() => reportClientError("window", new Error("sync failure"))).not.toThrow();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => reportClientError("window", new Error("storage failure"))).not.toThrow();

    await Promise.resolve();
    // Each failed report is attempted once and never retried.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("keeps rendering the fallback UI when reporting itself fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendBeacon.mockImplementation(() => {
      throw new Error("beacon blew up");
    });
    fetchMock.mockImplementation(() => {
      throw new Error("fetch blew up");
    });

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByRole("button", { name: "Reload Page" })).toBeInTheDocument();
  });

  it("strips query strings and fragments from app-relative URLs", () => {
    expect(sanitize('No route matches URL "/signup?returnTo=/x&code=123456"')).toBe(
      'No route matches URL "/signup"'
    );
    expect(sanitize("GET /api/items?search=my+secret failed")).toBe("GET /api/items failed");
    expect(sanitize("at load (/src/a.ts?t=171:12:5)")).toBe("at load (/src/a.ts:12:5)");
    expect(sanitize("redirect to /quiz#answer-3 failed")).toBe("redirect to /quiz failed");
    expect(sanitize("bad params ?code=123456&state=abc here")).toBe("bad params  here");
    expect(sanitize("ratio 3/4 is fine")).toBe("ratio 3/4 is fine");
  });

  it("sanitizes URLs, emails and bearer tokens", () => {
    expect(
      sanitize("GET https://user:pw@api.test/items?q=1#x failed for a.b@example.com with Bearer abc.def")
    ).toBe("GET https://api.test/items failed for [email] with Bearer [token]");
  });
});
