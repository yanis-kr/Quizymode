# #106 production check: anonymous quiz then signup page, same tab

2026-10-16 18:43 UTC against https://www.quizymode.com (3.57.0), headless Chromium, normal Chrome UA, fresh context. Played the home 5-question quiz to the end, then opened `/signup?reason=save-progress` in the same tab and focused the form. The form was **never submitted**; no account was created.

- `prod-anon-flow.mjs`, `requests.json` (every analytics request and its status), `db-events.txt` (read-only query of production `AnalyticsEvents`, last 30 min), `screenshots/`.
- Browser sent 8 events in 4 requests, all HTTP 202. Production stored all 8 with one session id, `IsInternal` false, `IsBot` false: quick_quiz_started, 5x question_answered, quiz_completed (context `home`), then signup_form_started (context `auth` / `save-progress`).
- Not covered: signup_submitted, signup_confirmation_shown, signup_confirmed, sign_in_completed (they need a real account).
- These 8 rows are real production rows from this check (not internal-flagged); they count toward funnel numbers.
