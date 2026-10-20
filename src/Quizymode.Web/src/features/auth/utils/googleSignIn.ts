import { signInWithRedirect } from "aws-amplify/auth";
import { isKnownReason, validateReturnTo, type AuthIntent } from "./authIntent";

const INTENT_KEY = "qm.auth.googleIntent";
const RETRY_KEY = "qm.auth.googleLinkRetry";

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Re-validates on read: sessionStorage is same-origin but still treated as untrusted input. */
export function sanitizeIntent(candidate: unknown): AuthIntent {
  const record = candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : {};
  const returnTo = typeof record.returnTo === "string" ? record.returnTo : null;
  const reason = typeof record.reason === "string" ? record.reason : null;
  return { returnTo: validateReturnTo(returnTo), reason: isKnownReason(reason) ? reason : null };
}

export function parseIntentJson(raw: string | null | undefined): AuthIntent | null {
  if (!raw) return null;
  try {
    return sanitizeIntent(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function readStoredGoogleIntent(): AuthIntent | null {
  return parseIntentJson(safeSession()?.getItem(INTENT_KEY));
}

export function clearStoredGoogleIntent(): void {
  safeSession()?.removeItem(INTENT_KEY);
}

export function hasGoogleLinkRetried(): boolean {
  return safeSession()?.getItem(RETRY_KEY) === "1";
}

export function clearGoogleLinkRetry(): void {
  safeSession()?.removeItem(RETRY_KEY);
}

/**
 * Starts the Cognito authorization-code + PKCE redirect to Google. The intent is persisted first because a failure
 * event carries no custom state. A user-initiated click clears the link-retry marker; the one automatic retry after
 * QM_ACCOUNT_LINKED sets it BEFORE redirecting so a second linked error can never loop.
 */
export async function startGoogleSignIn(intent: AuthIntent, options?: { isRetry?: boolean }): Promise<void> {
  const safeIntent = sanitizeIntent(intent);
  const storage = safeSession();
  storage?.setItem(INTENT_KEY, JSON.stringify(safeIntent));
  if (options?.isRetry) {
    storage?.setItem(RETRY_KEY, "1");
  } else {
    storage?.removeItem(RETRY_KEY);
  }

  await signInWithRedirect({ provider: "Google", customState: JSON.stringify(safeIntent) });
}
