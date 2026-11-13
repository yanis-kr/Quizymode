/**
 * The E2E user-agent token (#573). Every Playwright project appends ` QuizymodeE2E/<id>` to its device user agent so the API
 * classifies its hits as `automated` even before sign-in (the token is a request header, not an account property). The API only
 * accepts the exact anchored pattern `QuizymodeE2E/[A-Za-z0-9._-]{1,40}` at the very end of the user agent.
 */
export const E2E_TOKEN_PREFIX = "QuizymodeE2E/";
export const E2E_TOKEN_PATTERN = /(?:^|\s)QuizymodeE2E\/[A-Za-z0-9._-]{1,40}$/;

/** The run id: the GitHub run id in CI, otherwise "local"; sanitised to [A-Za-z0-9._-] and at most 40 characters. */
export function e2eRunId(env: Record<string, string | undefined> = process.env): string {
  const raw = env.GITHUB_RUN_ID || "local";
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 40);
  return cleaned.length > 0 ? cleaned : "local";
}

/** `device.userAgent` plus the token. Set it after the device spread so it is not overwritten by the device defaults. */
export function e2eUserAgent(device: { userAgent: string }, env: Record<string, string | undefined> = process.env): string {
  return `${device.userAgent} ${E2E_TOKEN_PREFIX}${e2eRunId(env)}`;
}
