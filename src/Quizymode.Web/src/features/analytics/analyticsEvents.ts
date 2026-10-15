import { analyticsApi, type AnalyticsEventPayload } from "@/api/analytics";
import { getPageViewSessionId } from "@/utils/pageViewTracking";

/** Must match AnalyticsEventCatalog on the API; unknown names are rejected there. */
export type AnalyticsEventName =
  | "quick_quiz_started"
  | "quiz_completed"
  | "signup_prompt_viewed"
  | "signup_prompt_clicked"
  | "signup_form_started"
  | "signup_submitted"
  | "signup_confirmation_shown"
  | "signup_confirmed"
  | "sign_in_completed"
  | "guest_state_imported";

export type AnalyticsContextType =
  | "auth"
  | "category"
  | "collection"
  | "flashcards"
  | "home"
  | "quiz";

export interface AnalyticsEventInput {
  name: AnalyticsEventName;
  contextType?: AnalyticsContextType;
  contextId?: string;
  /** One quiz/flashcards run. The API stores at most one event per name and run per session. */
  runId?: string;
  score?: number;
  total?: number;
}

const MAX_BATCH = 25;
const SENT_ONCE_STORAGE_KEY = "quizymode.analytics.sent-once";
const MAX_SENT_ONCE_KEYS = 200;
const TOKEN_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

let queue: AnalyticsEventPayload[] = [];
let flushScheduled = false;
const sentOnceInMemory = new Set<string>();

/**
 * Records an engagement event without ever blocking or failing the caller. Events queued in the
 * same tick are sent as one batch; a failed send is dropped rather than retried in a loop.
 */
export function trackEvent(input: AnalyticsEventInput): void {
  enqueue(input, undefined);
}

/**
 * Records an event at most once per tab session for `onceKey` (for example one prompt impression),
 * so React remounts and repeated renders do not inflate counts. The key doubles as the server-side
 * idempotency id when it is a short token.
 */
export function trackEventOnce(onceKey: string, input: AnalyticsEventInput): void {
  const scopedKey = `${input.name}:${onceKey}`;
  if (hasSentOnce(scopedKey)) {
    return;
  }

  rememberSentOnce(scopedKey);
  enqueue(input, TOKEN_PATTERN.test(onceKey) ? onceKey : undefined);
}

/** A random id suitable for runIds and impression keys. */
export function createAnalyticsId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Sends anything still queued. Exposed for tests and for callers about to navigate away. */
export async function flushAnalyticsEvents(): Promise<void> {
  flushScheduled = false;
  while (queue.length > 0) {
    const batch = queue.slice(0, MAX_BATCH);
    queue = queue.slice(MAX_BATCH);
    try {
      await analyticsApi.trackEvents({ sessionId: getPageViewSessionId(), events: batch });
    } catch (error) {
      console.debug("Analytics event delivery failed", error);
    }
  }
}

function enqueue(input: AnalyticsEventInput, clientEventId: string | undefined): void {
  try {
    const payload: AnalyticsEventPayload = {
      name: input.name,
      path: currentPath(),
      ...(input.contextType ? { contextType: input.contextType } : {}),
      ...(input.contextType && input.contextId ? { contextId: input.contextId } : {}),
      ...(clientEventId ? { clientEventId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(typeof input.score === "number" ? { score: input.score } : {}),
      ...(typeof input.total === "number" ? { total: input.total } : {}),
    };

    queue.push(payload);
    if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(() => {
        void flushAnalyticsEvents();
      });
    }
  } catch (error) {
    console.debug("Analytics event was not queued", error);
  }
}

function currentPath(): string {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  return path && path.startsWith("/") ? path.slice(0, 512) : "/";
}

function hasSentOnce(scopedKey: string): boolean {
  if (sentOnceInMemory.has(scopedKey)) {
    return true;
  }

  try {
    const raw = window.sessionStorage.getItem(SENT_ONCE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]).includes(scopedKey) : false;
  } catch {
    return false;
  }
}

function rememberSentOnce(scopedKey: string): void {
  sentOnceInMemory.add(scopedKey);
  try {
    const raw = window.sessionStorage.getItem(SENT_ONCE_STORAGE_KEY);
    const keys = raw ? (JSON.parse(raw) as string[]) : [];
    keys.push(scopedKey);
    window.sessionStorage.setItem(
      SENT_ONCE_STORAGE_KEY,
      JSON.stringify(keys.slice(-MAX_SENT_ONCE_KEYS))
    );
  } catch {
    // In-memory dedupe still covers this page load.
  }
}

/** Test-only: clears module state between tests. */
export function resetAnalyticsEventsForTests(): void {
  queue = [];
  flushScheduled = false;
  sentOnceInMemory.clear();
}
