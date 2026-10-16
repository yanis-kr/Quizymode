# #106 telemetry check 2 (signup), partly simulated (2026-10-16)

Branch `feat/106-signup-events` (main 66dade3 + signup instrumentation). Real browser, real SPA, real local API, throwaway postgres:17.6.
**Simulated: the identity provider.** Cognito SignUp and ConfirmSignUp were answered by Playwright with canned success; every other Cognito call (including automatic sign-in) was rejected, so the run ends on "Account confirmed - sign in to continue". `sign_in_completed` was therefore NOT produced live; it is covered by unit tests only.
`db-events.txt`: 11 stored rows, 1 distinct session: quick_quiz_started, quiz_completed, 5 x question_answered, then signup_form_started, signup_submitted, signup_confirmation_shown, signup_confirmed (context auth / save-progress; no email, name, password or code).
