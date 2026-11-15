// Fixed, user-facing copy for the forgot-password flow (#569). Cognito's raw message is never shown, and
// classification is by error name only. The request step has no error copy at all: it always shows
// REQUEST_SENT_MESSAGE so the form does not reveal whether an account exists.

export const REQUEST_SENT_MESSAGE =
  "If an account exists for that email, we sent a verification code. Enter it below with a new password.";

export const GOOGLE_ONLY_HINT =
  "Signed up with Google? Google accounts have no Quizymode password. Use Continue with Google on the sign-in page.";

export type PasswordResetErrorCode =
  | "invalid-code"
  | "too-many-attempts"
  | "weak-password"
  | "network"
  | "generic";

export const PASSWORD_RESET_ERROR_COPY: Record<PasswordResetErrorCode, string> = {
  "invalid-code": "That code is invalid or has expired. Check the code or request a new one.",
  "too-many-attempts": "Too many attempts. Wait a few minutes and try again.",
  "weak-password":
    "That password doesn't meet the requirements. Use at least 8 characters with upper and lower case letters, a number and a symbol.",
  network: "We couldn't reach the service. Check your connection and try again.",
  generic: "We couldn't reset your password. Please try again.",
};

export function passwordResetErrorCode(err: unknown): PasswordResetErrorCode {
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "CodeMismatchException":
    case "ExpiredCodeException":
      return "invalid-code";
    case "LimitExceededException":
    case "TooManyRequestsException":
    case "TooManyFailedAttemptsException":
      return "too-many-attempts";
    case "InvalidPasswordException":
      return "weak-password";
    case "NetworkError":
      return "network";
    default:
      return "generic";
  }
}

/** Maps any confirm-step failure to fixed copy. Never returns err.message. */
export function mapPasswordResetError(err: unknown): string {
  return PASSWORD_RESET_ERROR_COPY[passwordResetErrorCode(err)];
}
