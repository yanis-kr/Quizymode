// Fixed, user-facing copy for email/password sign-in failures (#235). Cognito's raw message is never shown:
// NotAuthorizedException and UserNotFoundException deliberately share one string so the form does not reveal
// whether an account exists. Cognito reports a lockout ("Password attempts exceeded") as NotAuthorizedException,
// so it also shows the incorrect-credentials copy; classification is by error name / sign-in step, never by message.

/** Text that renders "Feedback page" as a link to /feedback. */
export const FEEDBACK_LINK_LABEL = "Feedback page";

export type SignInErrorCode =
  | "incorrect-credentials"
  | "too-many-attempts"
  | "unconfirmed"
  | "reset-required"
  | "unsupported-step"
  | "network"
  | "generic";

export const SIGN_IN_ERROR_COPY: Record<SignInErrorCode, string> = {
  "incorrect-credentials": "Incorrect email or password.",
  "too-many-attempts": "Too many sign-in attempts. Wait a few minutes and try again.",
  unconfirmed: `This account hasn't been confirmed yet. Please contact us through the ${FEEDBACK_LINK_LABEL} and we'll help you finish setting it up.`,
  "reset-required": `This account needs a password reset before you can sign in. Please contact us through the ${FEEDBACK_LINK_LABEL}.`,
  "unsupported-step": `This account needs a sign-in step this app doesn't support yet. Please contact us through the ${FEEDBACK_LINK_LABEL}.`,
  network: "We couldn't reach the sign-in service. Check your connection and try again.",
  generic: "Sign-in failed. Please try again.",
};

/** Thrown by AuthContext.login when Amplify reports sign-in is not complete (isSignedIn false). */
export class SignInStepRequiredError extends Error {
  readonly signInStep: string;

  constructor(signInStep: string) {
    super(`Sign-in requires an additional step: ${signInStep}`);
    this.name = "SignInStepRequiredError";
    this.signInStep = signInStep;
  }
}

/** Thrown by AuthContext.login when sign-in succeeded but no authenticated session could be established. */
export class SignInSessionError extends Error {
  constructor() {
    super("Sign-in succeeded but the session could not be established.");
    this.name = "SignInSessionError";
  }
}

export interface SignInErrorMessage {
  code: SignInErrorCode;
  text: string;
  /** True when `text` contains FEEDBACK_LINK_LABEL, which the UI renders as a link to /feedback. */
  linkToFeedback: boolean;
}

export function signInErrorCode(err: unknown): SignInErrorCode {
  if (err instanceof SignInStepRequiredError) {
    if (err.signInStep === "CONFIRM_SIGN_UP") return "unconfirmed";
    if (err.signInStep === "RESET_PASSWORD") return "reset-required";
    return "unsupported-step";
  }
  if (err instanceof SignInSessionError) return "generic";
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "incorrect-credentials";
    case "LimitExceededException":
    case "TooManyRequestsException":
    case "TooManyFailedAttemptsException":
      return "too-many-attempts";
    case "NetworkError":
      return "network";
    default:
      return "generic";
  }
}

/** Maps any sign-in failure to fixed copy. Never returns err.message. */
export function mapSignInError(err: unknown): SignInErrorMessage {
  const code = signInErrorCode(err);
  const text = SIGN_IN_ERROR_COPY[code];
  return { code, text, linkToFeedback: text.includes(FEEDBACK_LINK_LABEL) };
}
