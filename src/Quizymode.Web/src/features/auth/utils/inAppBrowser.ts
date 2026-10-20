// Embedded in-app browsers that Google blocks for OAuth ("disallowed_useragent"). Deliberately a short allowlist of
// known-blocked user agents; the Google Search app (GSA) is NOT classified as embedded.
const EMBEDDED_PATTERNS: RegExp[] = [
  /Instagram/i,
  /FBAN|FBAV|FB_IAB/,
  /musical_ly|BytedanceWebview|TikTok/i,
  /\bLine\//,
  /LinkedInApp/i,
  /Snapchat/i,
  /; wv\)/,
];

export function isEmbeddedWebView(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return EMBEDDED_PATTERNS.some((pattern) => pattern.test(userAgent));
}
