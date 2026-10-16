# #109 CONV-001 contextual signup prompt: acceptance evidence

Branch `feat/109-signup-prompts` (PR #160, commit 53f3930), run locally on 2026-10-16.

**Stack:** API from the branch on Kestrel (`https://localhost:8082`, Development, auto-seeded from `data/seed-dev`) against a throwaway `postgres:17.6` container (`qm-ev-109`, port 54399, removed afterwards); Vite SPA on `:7000`; headless Chromium with a normal Chrome UA. **Signed-in sessions used a local test issuer (`fake-oidc.cs`), not Cognito**: the API's JWT validation ran unchanged with only `Authentication:Cognito:Authority/ClientId/Audience` pointed at it, and the SPA got the tokens through Amplify's localStorage keys. No production system was touched.

| File | What |
|---|---|
| `evidence-109.mjs` | Playwright script: home 5-question quiz at 390x844 and 1280x900 as anonymous (prompt, click-through, dismissal) and signed in |
| `results.json` | 16 checks, all PASS, plus the session id of each browser context |
| `screenshots/` | `{390,1280}-01` first question (no prompt), `-02` completion with prompt, `-03` signup page reached from the prompt, `-04` after **Not now**, `-05` after Play again + reload (still dismissed), `-06` signed-in completion (no prompt) |
| `prompt-events-sent.json` / `analytics-requests.json` | every `POST /api/analytics/events` body and response captured in the browser |
| `db-prompt-events.txt` | rows read back from `AnalyticsEvents` via `docker exec psql` |
| `local-stack/` | trimmed API log (DB command lines removed), IdP/Vite logs, raw script output, session map |

**Results**

- No prompt on the first question; the `save-progress` prompt appears on the anonymous **Quiz complete** summary at both sizes with no horizontal scroll.
- **Create a free account** lands on `/signup?returnTo=<the quiz URL>&reason=save-progress`; `returnTo` equals the quiz path and query.
- **Not now** hides it and leaves the score and actions untouched; it stays hidden after **Play again** and after a reload in the same tab.
- Signed in (API saw `IsAuthenticated = true`), the completion summary has no prompt and no prompt events are sent.
- DB: each anonymous session stored exactly one `signup_prompt_viewed` (the dismissal sessions had two completions and a reload, still one), and the click sessions one `signup_prompt_clicked`. Every prompt row has context `auth` / `save-progress`, no user id, no run/score/item, a path without query string, and dedupe key `…:client:prompt:save-progress`. The PII-marker query returns 0.

**Observation (not part of this change):** the signup page's existing `save-progress` copy (from #111) says "Your result stays saved in this browser for now". After signing up, the guest run is not restored for the new signed-in identity (AC 3.6.12), so that wording may overstate things. It was not changed here.
