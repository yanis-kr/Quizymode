# #106 telemetry check 1: anonymous quiz start and completion (local, 2026-10-15)

Branch `feat/106-quiz-instrumentation`, `771c4b6`. Local stack: that branch's API on a throwaway `postgres:17.6` (migrations through `20261015184329_AddAnalyticsEvents`), its Vite SPA, and headless Chromium with a normal Chrome UA. **Anonymous, with no identity provider involved. Not production.**

Flow (`telemetry-106.mjs`): Home → **Play a 5-question quiz** → answer every question → View results → **Play again**.

- `telemetry-requests.json`: every `POST /api/analytics/events` the browser sent (all 202).
- `db-events.txt`: the rows stored for the browser's session id. One `quick_quiz_started` and one `quiz_completed` share run `dcae82e6` (score 3 of 5, context `home`); **Play again** started run `8886dca4`. The same session id carries 8 page views.
