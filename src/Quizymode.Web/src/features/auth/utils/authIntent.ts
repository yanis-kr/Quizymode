/**
 * Shared safe-return-intent utility for the auth flow. One parse/build/validate
 * surface used by every producer (RequireAuthRoute) and consumer (LoginPage,
 * SignUpPage) so returnTo/reason handling isn't reinvented per page.
 *
 * Follows the OWASP Unvalidated Redirects and Forwards guidance: restrict
 * destinations to this app's own origin, reject anything that could resolve
 * externally or ambiguously, and never automatically replay a mutation.
 */

import { parseInAppUrl } from "@/utils/safeInAppPath";

export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";
const DEFAULT_RETURN_TO = "/";

export const AUTH_REASONS = [
  "save-progress",
  "keep-collection",
  "create-content",
  "join-discussion",
  "review-later",
  "track-progress",
] as const;

export type AuthReason = (typeof AUTH_REASONS)[number];

export function isKnownReason(value: string | null | undefined): value is AuthReason {
  return typeof value === "string" && (AUTH_REASONS as readonly string[]).includes(value);
}

function normalizedPathFor(path: string): string {
  if (path.length <= 1) return path;
  // Decode percent-encoding before comparing so an alternate encoding of
  // "/login" (e.g. "/%6C%6Fgin") can't slip past the recursion check as a
  // byte-for-byte-different string. Falls back to the raw path on a
  // malformed escape rather than throwing.
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Keep the raw (still same-origin, already-validated) path.
  }
  const trimmed = decoded.replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed.toLowerCase();
}

function isAuthReturnDestination(pathname: string): boolean {
  const normalized = normalizedPathFor(pathname);
  return (
    normalized === LOGIN_PATH ||
    normalized === SIGNUP_PATH ||
    normalized === "/auth" ||
    normalized.startsWith("/auth/")
  );
}

/**
 * Validates an untrusted `returnTo` candidate against this app's own origin.
 * Returns a safe destination (path + query + hash) or the default "/" when
 * the candidate is missing, invalid, unsafe, or points back at auth itself.
 */
export function validateReturnTo(raw: string | null | undefined): string {
  const parsed = parseInAppUrl(raw);
  if (!parsed) return DEFAULT_RETURN_TO;
  if (isAuthReturnDestination(parsed.pathname)) return DEFAULT_RETURN_TO;

  // Re-derive the destination from the parsed URL (not the raw string) so a
  // form that normalizes differently after browser parsing can't sneak
  // through as something other than what will actually be navigated to.
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export interface AuthIntent {
  returnTo: string;
  reason: AuthReason | null;
}

/** Parses returnTo/reason out of an auth page's query string (e.g. `location.search`). */
export function parseAuthIntent(search: string): AuthIntent {
  const params = new URLSearchParams(search);
  const returnToValues = params.getAll("returnTo");
  const rawReturnTo = returnToValues.length === 1 ? returnToValues[0] : null;
  const reasonValues = params.getAll("reason");
  const rawReason = reasonValues.length === 1 ? reasonValues[0] : null;

  return {
    returnTo: validateReturnTo(rawReturnTo),
    reason: isKnownReason(rawReason) ? rawReason : null,
  };
}

/** Builds the query string to carry intent between login/signup; "" when there's nothing to carry. */
export function buildAuthIntentQuery(intent: {
  returnTo?: string | null;
  reason?: string | null;
}): string {
  const params = new URLSearchParams();
  const safeReturnTo = validateReturnTo(intent.returnTo);
  if (safeReturnTo !== DEFAULT_RETURN_TO) {
    params.set("returnTo", safeReturnTo);
  }
  if (isKnownReason(intent.reason)) {
    params.set("reason", intent.reason);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
