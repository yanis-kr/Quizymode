import { Hub } from "aws-amplify/utils";

/**
 * Module-scope capture of Amplify's OAuth redirect result (AUTH-003, #118). Amplify's Hub does not replay events to
 * late subscribers and failures fire before React renders, so main.tsx installs this listener BEFORE configuring
 * Amplify. Only /auth/callback consumes the outcome; nothing else may render a stale result.
 */
export interface OAuthOutcome {
  status: "none" | "success" | "failure";
  /** Raw Cognito/Amplify failure message. Matched against sentinels but never rendered. */
  message: string | null;
  /** Custom state passed to signInWithRedirect, if Amplify reported it. */
  customState: string | null;
}

/** What the URL looked like when the app loaded, captured before Amplify can rewrite it. */
export interface InitialOAuthParams {
  hasCode: boolean;
  error: string | null;
  errorDescription: string | null;
}

const EMPTY: OAuthOutcome = { status: "none", message: null, customState: null };
const NO_PARAMS: InitialOAuthParams = { hasCode: false, error: null, errorDescription: null };

let outcome: OAuthOutcome = EMPTY;
let initialParams: InitialOAuthParams = NO_PARAMS;
let installed = false;
let unlisten: (() => void) | null = null;
const subscribers = new Set<() => void>();

function publish(next: OAuthOutcome): void {
  outcome = next;
  subscribers.forEach((subscriber) => subscriber());
}

function readErrorMessage(data: unknown): string {
  if (data && typeof data === "object") {
    const record = data as { error?: unknown; message?: unknown };
    if (record.error instanceof Error) return record.error.message;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return "";
}

/** Idempotent. Call before Amplify.configure. */
export function installOAuthOutcomeListener(): void {
  if (installed) return;
  installed = true;

  const params = new URLSearchParams(window.location.search);
  initialParams = {
    hasCode: params.has("code"),
    error: params.get("error"),
    errorDescription: params.get("error_description"),
  };

  unlisten = Hub.listen("auth", ({ payload }) => {
    switch (payload.event) {
      case "customOAuthState":
        publish({ ...outcome, customState: typeof payload.data === "string" ? payload.data : null });
        break;
      case "signInWithRedirect":
        publish({ ...outcome, status: "success", message: null });
        break;
      case "signInWithRedirect_failure":
        publish({ ...outcome, status: "failure", message: readErrorMessage(payload.data) });
        break;
      default:
        break;
    }
  });
}

export function subscribeOAuthOutcome(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export function getOAuthOutcome(): OAuthOutcome {
  return outcome;
}

export function getInitialOAuthParams(): InitialOAuthParams {
  return initialParams;
}

export function clearOAuthOutcome(): void {
  if (outcome !== EMPTY) publish(EMPTY);
}

/** Test helper: remove the Hub listener and reset module state. */
export function resetOAuthOutcomeForTests(): void {
  unlisten?.();
  unlisten = null;
  installed = false;
  outcome = EMPTY;
  initialParams = NO_PARAMS;
  subscribers.clear();
}
