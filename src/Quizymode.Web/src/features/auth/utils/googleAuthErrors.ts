// Sentinel strings thrown by the Cognito Pre sign-up Lambda (infra/cognito-presignup/lib/errors.mjs).
// Keep both files in sync. Cognito wraps them as "PreSignUp failed with error <SENTINEL>.", so they are matched as
// whole tokens inside the message.
export const QM_ACCOUNT_LINKED = "QM_ACCOUNT_LINKED";
export const QM_GOOGLE_EMAIL_UNVERIFIED = "QM_GOOGLE_EMAIL_UNVERIFIED";
export const QM_USE_GOOGLE = "QM_USE_GOOGLE";

export type GoogleAuthErrorCode =
  | "linked-retry-failed"
  | "email-unverified"
  | "cancelled"
  | "generic";

export const GOOGLE_AUTH_ERROR_COPY: Record<GoogleAuthErrorCode, string> = {
  "linked-retry-failed":
    "We couldn't finish signing you in with Google. Please try again, or use your email and password.",
  "email-unverified": "Verify your email with Google first, then try again.",
  cancelled: "You cancelled sign-in with Google. No changes were made.",
  generic: "Something went wrong while signing you in with Google. Please try again.",
};

/** True when `message` contains `sentinel` as a whole token (not as part of a longer identifier). */
export function hasSentinel(message: string | null | undefined, sentinel: string): boolean {
  if (!message) return false;
  return new RegExp(`(?<![A-Za-z0-9_])${sentinel}(?![A-Za-z0-9_])`).test(message);
}

/**
 * Maps a raw Amplify/Cognito failure message to a fixed error code. The raw text is never shown to the user.
 * QM_ACCOUNT_LINKED is intentionally not handled here: the caller decides whether it is a retry or a failure.
 */
export function mapGoogleFailure(message: string | null | undefined): GoogleAuthErrorCode {
  if (hasSentinel(message, QM_GOOGLE_EMAIL_UNVERIFIED)) return "email-unverified";
  if (message && /access_denied|cancel/i.test(message)) return "cancelled";
  return "generic";
}
