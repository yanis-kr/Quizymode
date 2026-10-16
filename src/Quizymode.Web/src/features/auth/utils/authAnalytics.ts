import { trackEventOnce, type AnalyticsEventInput } from "@/features/analytics/analyticsEvents";
import type { AuthIntent } from "./authIntent";

/**
 * Signup and sign-in funnel events (AC 5.4.9a). Each fires at most once per tab session, so retries,
 * resends and remounts do not inflate the funnel. The only context sent is the allowlisted signup
 * reason: never an email, display name, password, confirmation code or return path.
 */
function authContext(intent: AuthIntent): Pick<AnalyticsEventInput, "contextType" | "contextId"> {
  return intent.reason
    ? { contextType: "auth", contextId: intent.reason }
    : { contextType: "auth" };
}

/** The visitor first interacts with the signup form. */
export function trackSignupFormStarted(intent: AuthIntent): void {
  trackEventOnce("form-started", { name: "signup_form_started", ...authContext(intent) });
}

/** A signup attempt passed local validation and is being sent to the identity provider. */
export function trackSignupSubmitted(intent: AuthIntent): void {
  trackEventOnce("submitted", { name: "signup_submitted", ...authContext(intent) });
}

/** The identity provider accepted the signup and the confirmation-code step is shown. */
export function trackSignupConfirmationShown(intent: AuthIntent): void {
  trackEventOnce("confirmation-shown", { name: "signup_confirmation_shown", ...authContext(intent) });
}

/** The confirmation code was accepted, whether or not automatic sign-in then succeeded. */
export function trackSignupConfirmed(intent: AuthIntent): void {
  trackEventOnce("confirmed", { name: "signup_confirmed", ...authContext(intent) });
}

/** A verified authenticated session exists after signing in or after confirming a new account. */
export function trackSignInCompleted(intent: AuthIntent): void {
  trackEventOnce("completed", { name: "sign_in_completed", ...authContext(intent) });
}
