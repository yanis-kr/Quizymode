import { API_URL } from "@/api/client";
import { getPageViewSessionId, isInternalBrowser } from "@/utils/pageViewTracking";
import { getToken } from "@/utils/tokenStorage";

/**
 * Front-end error reporting (OBS-001). Captures React render errors (via ErrorBoundary), window
 * `error` events (runtime errors and failed script/chunk loads), and unhandled promise rejections,
 * and sends each distinct error at most once per tab session, at most MAX_REPORTS_PER_SESSION
 * per tab session, to `POST /client-errors`. Reporting never throws, never blocks, never retries.
 */

export type ClientErrorSource = "boundary" | "window" | "promise";

export interface ClientErrorPayload {
  source: ClientErrorSource;
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  path: string;
  appVersion: string;
  sessionId: string;
  internalBrowser?: boolean;
}

interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  filename?: string;
}

export const MAX_REPORTS_PER_SESSION = 10;
export const LIMITS = {
  message: 500,
  name: 100,
  stack: 4000,
  componentStack: 2000,
  path: 512,
} as const;

const STORAGE_KEY = "quizymode.client-errors.sent";
const EXTENSION_URL = /\b(?:chrome|moz|safari(?:-web)?|ms-browser|edge)-extension:\/\//i;
const URL_PATTERN =
  /([A-Za-z][A-Za-z0-9+.-]*:\/\/)(?:[^\s/@?#]*@)?([^\s?#()'"<>]*)(?:[?#][^\s()'"<>]*?)?((?::\d+){1,2})?(?=[\s()'"<>]|$)/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const BEARER_PATTERN = /\bbearer\s+[A-Za-z0-9._~+/=-]+/gi;

let sentInMemory: string[] = [];
let installedCleanup: (() => void) | null = null;

/** Records one error. Safe to call from anywhere: it never throws and never awaits. */
export function reportClientError(
  source: ClientErrorSource,
  error: unknown,
  componentStack?: string | null
): void {
  try {
    const details = describeError(error, source);
    if (!details || shouldIgnore(details)) {
      return;
    }

    const name = truncate(sanitize(details.name), LIMITS.name);
    const message = truncate(sanitize(details.message), LIMITS.message);
    const stack = details.stack ? truncate(sanitize(details.stack), LIMITS.stack) : undefined;

    const key = `${name}|${message}|${topFrame(stack, name)}`;
    const sent = loadSent();
    if (sent.includes(key) || sent.length >= MAX_REPORTS_PER_SESSION) {
      return;
    }

    saveSent([...sent, key]);

    const payload: ClientErrorPayload = {
      source,
      name,
      message,
      ...(stack ? { stack } : {}),
      ...(componentStack
        ? { componentStack: truncate(sanitize(componentStack), LIMITS.componentStack) }
        : {}),
      path: currentPath(),
      appVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown",
      sessionId: getPageViewSessionId(),
      ...(isInternalBrowser() ? { internalBrowser: true } : {}),
    };

    send(payload);
  } catch {
    // Reporting must never make things worse.
  }
}

/**
 * Listens for window `error` events (capture phase, so failed `<script>` and module-preload loads
 * are seen too) and unhandled promise rejections. Idempotent; returns a function that removes them.
 */
export function installClientErrorReporting(): () => void {
  if (installedCleanup || typeof window === "undefined") {
    return installedCleanup ?? (() => undefined);
  }

  const onError = (event: Event) => {
    if (typeof ErrorEvent !== "undefined" && event instanceof ErrorEvent) {
      reportClientError(
        "window",
        event.error instanceof Error
          ? event.error
          : {
              name: "Error",
              message: event.message || "Unknown error",
              filename: event.filename,
            }
      );
      return;
    }

    const failedLoad = describeFailedResource(event.target);
    if (failedLoad) {
      reportClientError("window", failedLoad);
    }
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    reportClientError("promise", event.reason);
  };

  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);

  installedCleanup = () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection);
    installedCleanup = null;
  };

  return installedCleanup;
}

/** Removes query strings, fragments and userinfo from URLs, and emails and tokens from text. */
export function sanitize(value: string): string {
  return value
    .replace(URL_PATTERN, (_match, scheme: string, rest: string, position?: string) =>
      `${scheme}${rest}${position ?? ""}`
    )
    .replace(JWT_PATTERN, "[token]")
    .replace(BEARER_PATTERN, "Bearer [token]")
    .replace(EMAIL_PATTERN, "[email]");
}

function describeError(error: unknown, source: ClientErrorSource): ErrorDetails | null {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || String(error),
      stack: typeof error.stack === "string" ? error.stack : undefined,
    };
  }

  if (typeof error === "string") {
    return { name: "Error", message: error };
  }

  if (error && typeof error === "object" && typeof (error as ErrorDetails).message === "string") {
    const candidate = error as Partial<ErrorDetails>;
    return {
      name: typeof candidate.name === "string" && candidate.name ? candidate.name : "Error",
      message: candidate.message!,
      stack: typeof candidate.stack === "string" ? candidate.stack : undefined,
      filename: typeof candidate.filename === "string" ? candidate.filename : undefined,
    };
  }

  if (source === "promise") {
    // Never serialize arbitrary rejection values: they can hold user data.
    return {
      name: "UnhandledRejection",
      message: `Non-Error promise rejection (${error === null ? "null" : typeof error})`,
    };
  }

  return null;
}

function describeFailedResource(target: EventTarget | null): ErrorDetails | null {
  if (typeof HTMLScriptElement !== "undefined" && target instanceof HTMLScriptElement && target.src) {
    return { name: "ChunkLoadError", message: `Failed to load script ${target.src}` };
  }

  if (
    typeof HTMLLinkElement !== "undefined" &&
    target instanceof HTMLLinkElement &&
    target.href &&
    /\b(?:modulepreload|stylesheet)\b/i.test(target.rel)
  ) {
    return { name: "ChunkLoadError", message: `Failed to load ${target.rel} ${target.href}` };
  }

  return null;
}

/** Cross-origin "Script error." carries nothing useful; extension-only stacks are not our bugs. */
function shouldIgnore(details: ErrorDetails): boolean {
  const message = details.message.trim();
  if (!message) {
    return true;
  }

  if (/^script error\.?$/i.test(message) && !details.stack) {
    return true;
  }

  if (details.filename && EXTENSION_URL.test(details.filename)) {
    return true;
  }

  if (details.stack) {
    const frames = stackFrames(details.stack);
    if (frames.length > 0 && frames.every((frame) => EXTENSION_URL.test(frame))) {
      return true;
    }
  }

  return false;
}

function stackFrames(stack: string): string[] {
  return stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at ") || line.includes("://"));
}

function topFrame(stack: string | undefined, name: string): string {
  if (!stack) {
    return "";
  }

  return stackFrames(stack).find((line) => !line.startsWith(`${name}:`)) ?? "";
}

function send(payload: ClientErrorPayload): void {
  const url = `${API_URL}/client-errors`;
  const body = JSON.stringify(payload);
  const token = safeGetToken();

  // sendBeacon cannot carry the bearer token, so signed-in reports use a keepalive fetch instead;
  // anonymous ones go as a text/plain beacon, which needs no CORS preflight.
  if (!token && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      if (navigator.sendBeacon(url, body)) {
        return;
      }
    } catch {
      // Fall through to fetch.
    }
  }

  if (typeof fetch !== "function") {
    return;
  }

  try {
    void fetch(url, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    }).catch(() => undefined);
  } catch {
    // Dropped: reports are best-effort.
  }
}

function safeGetToken(): string | null {
  try {
    return getToken();
  } catch {
    return null;
  }
}

function currentPath(): string {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  return path && path.startsWith("/") && !path.startsWith("//") ? truncate(path, LIMITS.path) : "/";
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function loadSent(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(stored)) {
      const keys = stored.filter((key): key is string => typeof key === "string");
      return keys.length >= sentInMemory.length ? keys : sentInMemory;
    }
  } catch {
    // Storage blocked: fall back to this page load's memory.
  }

  return sentInMemory;
}

function saveSent(keys: string[]): void {
  sentInMemory = keys;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // In-memory state still enforces the limits for this page load.
  }
}

/** Test-only: clears module state between tests. */
export function resetClientErrorReporterForTests(): void {
  sentInMemory = [];
  installedCleanup?.();
  installedCleanup = null;
}
