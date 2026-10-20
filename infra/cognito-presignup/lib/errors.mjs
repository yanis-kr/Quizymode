// Sentinel strings thrown from the Pre sign-up trigger. Cognito surfaces them to the SPA as
// "PreSignUp failed with error <SENTINEL>." (UserLambdaValidationException / OAuth error_description).
// The SPA mirrors these values in src/Quizymode.Web/src/features/auth/utils/googleAuthErrors.ts;
// keep both in sync.

/** A verified Google identity was linked to an existing password account; the SPA retries sign-in once. */
export const ACCOUNT_LINKED = "QM_ACCOUNT_LINKED";

/** Google reported the email as unverified; nothing is created or linked. */
export const GOOGLE_EMAIL_UNVERIFIED = "QM_GOOGLE_EMAIL_UNVERIFIED";

/** A password sign-up used the email of a Google-only account. */
export const USE_GOOGLE = "QM_USE_GOOGLE";

/** A same-email password account exists in a state that cannot be safely linked or replaced. */
export const NATIVE_ACCOUNT_STATE = "QM_NATIVE_ACCOUNT_STATE";
