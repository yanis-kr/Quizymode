# #127 ANALYTICS-007 study engagement events: acceptance evidence (2026-10-16)

Validated code: branch `feat/127-study-engagement-complete` at `df3ad41` (v3.58.2), which is `origin/main` (`d3afacb`, study events from PR #149) plus one acceptance test and docs.

**Setup.** This is a local integration run, not production. The API ran from the branch on `https://localhost:8127` (Development). It used a throwaway `postgres:17.6` container (`qm-ev-127`, :54127) with all migrations applied to an empty database. The Vite dev SPA ran on `:7127`. Headless Chromium (Playwright) used a normal Chrome UA. **The admin identity came from a local test issuer (`stack-scripts/fake-oidc.cs`, :7444), not Cognito.** The API's JWT validation and `Admin` policy ran unchanged.

Results: `local-stack/results.json`, 9/9 PASS.

| Acceptance criterion | Proof |
|---|---|
| A 10-question quiz records 1 start, 10 answers and 1 completion, all with the same run id | Browser: 4 requests, counts `{quick_quiz_started:1, question_answered:10, quiz_completed:1}`, one runId (`analytics-requests.json`). Stored rows: `04-db-rows.png`, `db-analytics-events.txt`. Unit test: `studyRunAcceptance.test.ts` |
| Changing an answer sends no second `question_answered` | Browser: tried to click option B after answering Q1, and only one position-1 answer was sent. The API also dedupes per run and item (xUnit `TrackAnalyticsEventsTests`) |
| Closing the tab after 4 answers delivers those 4, and the run counts as abandoned at position 4 | Browser: replay run answered 4 (0 sent before close, since batches hold 5), then the tab closed. Stored positions `1,2,3,4` for that run. Learning report: position 4 `runsAbandonedHere: 1`, position 5 reached by 1 of 2 runs (`03-admin-learning-tab.png`, `admin-learning-default.json`). Delivery uses a `keepalive` fetch with the bearer token, not `sendBeacon` (AC 5.5.3 explains why) |
| "Play again" starts a new run id | Browser: first run `fcb406a3…`, replay `8652fe8c…` |
| Unknown names and out-of-range values return 400 | HTTP: unknown name, position 0, position 501, score > total, and total 501 all got 400, and the row count did not change (`http-validation.json`) |
| Internal sessions are excluded from the Learning tab | Browser marked internal sent `internalBrowser: true`. The default report shows 2 quiz runs and `internalSessions: 1`. With `includeInternal=true` it shows 3 (`admin-learning-include-internal.json`) |
| Tests | `tests/vitest-study-events.txt` (34 passed), `tests/dotnet-study-events.txt` (43 passed: validation, idempotency, rate limit, report aggregation, HTTP auth) |

## Not covered

- **Channel and new-vs-returning filters** on the Learning tab. They depend on #122 and #123, which are not built yet, and moved to #163.
- A real Cognito login (a test issuer was used) and production data. Production was not touched.
- The `pagehide` path ran on headless Chromium tab close only. It was not tested on mobile Safari or with a real tab kill.
- A 50-question quiz was not run in the browser (seed data has 15 items). The rate-limit budget is covered by xUnit and by the request count (10 answers took 4 requests).
