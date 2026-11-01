/**
 * Same-origin guard for untrusted in-app path candidates (query-string
 * `return` / `returnTo` values). Rejects anything that could resolve to
 * another origin or parse ambiguously (OWASP Unvalidated Redirects and Forwards).
 */

export const MAX_IN_APP_PATH_LENGTH = 4096;
// Deliberately matches control characters to reject them from a URL
// destination; built from a string (not a literal regex) so the source file
// never has to contain raw control bytes.
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = new RegExp("[\x00-\x1f\x7f]");

/**
 * Parses an untrusted candidate into a same-origin URL, or null when it is
 * missing, oversized, contains control characters or backslashes, is not a
 * single-leading-slash path, or does not resolve to this app's origin.
 */
export function parseInAppUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  if (raw.length > MAX_IN_APP_PATH_LENGTH) return null;
  if (CONTROL_CHAR_PATTERN.test(raw)) return null;
  if (raw.includes("\\")) return null;
  // Reject protocol-relative ("//host/...") before parsing: the URL
  // constructor would otherwise happily resolve it to an external origin.
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  let parsed: URL;
  try {
    parsed = new URL(raw, origin);
  } catch {
    return null;
  }

  if (parsed.origin !== origin) return null;
  if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) return null;
  return parsed;
}

/**
 * Returns a safe in-app destination (path + query + hash re-derived from the
 * parsed URL) or null when the candidate is unsafe.
 */
export function sanitizeInAppPath(raw: string | null | undefined): string | null {
  const parsed = parseInAppUrl(raw);
  return parsed ? `${parsed.pathname}${parsed.search}${parsed.hash}` : null;
}
