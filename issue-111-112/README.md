# #111 / #112: local layout, keyboard and accessibility review of `/signup`

Tested 2026-10-16 on `main` at `fdc1f7a` (contains #150 and #155). **Local, partly simulated.** Real SPA (Vite) in headless Chromium with a normal Chrome UA.
Simulated: the Cognito calls (SignUp, ConfirmSignUp, ResendConfirmationCode answered with canned responses; every other Cognito call, including auto sign-in, rejected) and `/api/users/availability`. No API, database or production system was involved and no real account was created.

- `review-signup.mjs`: layout at 390x844, 1280x900, 200% zoom (640x450 desktop, 195x422 phone) for the default and each reason, keyboard flow, error exposure, confirmation step (bad code, resend cooldown, reload recovery, account-confirmed fallback). Output: `results.json`.
- `probe-focus-overflow.mjs`, `probe-overflow2.mjs`: focus-indicator styles per control and the source of the 195px confirmation-step overflow. Output: `probe-results.json`.
- `screenshots/`: no highlight overlays.

Not covered (needs a real identity and device): auto sign-in success, real code delivery and OTP autofill, throttling, resend after the cooldown elapses, already-registered account paths.
