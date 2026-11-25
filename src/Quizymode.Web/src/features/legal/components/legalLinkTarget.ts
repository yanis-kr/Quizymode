/**
 * Allowlist for links rendered from the legal markdown (#811). Only a relative path, an https URL or a mailto
 * address becomes a link; anything else (javascript:, data:, vbscript:, file:, http:, protocol-relative URLs, ...)
 * is refused and the caller renders the label as plain text. Fail closed: control characters, whitespace and
 * backslashes refuse.
 */
export type LegalLinkTarget =
  | { kind: "internal"; to: string }
  | { kind: "https"; href: string }
  | { kind: "mailto"; href: string };

const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000- \u007f-\u009f\\]/;

export function resolveLegalLinkTarget(rawHref: string): LegalLinkTarget | null {
  const href = rawHref.trim();
  if (href === "" || FORBIDDEN_CHARS.test(href)) return null;
  // Protocol-relative ("//host") would leave the site under the page's own scheme.
  if (href.startsWith("//")) return null;

  const scheme = SCHEME_PATTERN.exec(href)?.[1]?.toLowerCase();
  if (scheme === undefined) return { kind: "internal", to: href };

  if (scheme === "https") {
    try {
      const url = new URL(href);
      if (url.protocol !== "https:" || url.hostname === "" || url.username !== "" || url.password !== "") return null;
      return { kind: "https", href: url.toString() };
    } catch {
      return null;
    }
  }

  if (scheme === "mailto") {
    return href.length > "mailto:".length ? { kind: "mailto", href } : null;
  }

  return null;
}
