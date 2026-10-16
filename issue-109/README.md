# #109 CONV-001 contextual signup prompt: acceptance evidence

Branch `feat/109-signup-prompts` (PR #160), run locally on 2026-10-16. This folder was re-run on commit e2b03e5 after review: the save-progress signup copy is now neutral and the ACs are renumbered. The first run (commit 53f3930) is in this branch history at 6fb028a.

**Stack:** API from the branch on Kestrel (`https://localhost:8082`, Development, auto-seeded from `data/seed-dev`) against a throwaway `postgres:17.6` container (`qm-ev-109`, port 54399, removed afterwards); Vite SPA on `:7000`; headless Chromium with a normal Chrome UA. **Signed-in sessions used a local test issuer (`fake-oidc.cs`), not Cognito**: the API's JWT validation ran unchanged with only `Authentication:Cognito:Authority/ClientId/Audience` pointed at it, and the SPA got the tokens through Amplify's localStorage keys. No production system was touched.

| File | What |
|---|---|
| `evidence-109.mjs` | Playwright script: home 5-question quiz at 390x844 and 1280x900 as anonymous (prompt, click-through, dismissal) and signed in |
| `results.json` | 18 checks, all PASS, plus the session id of each browser context |
| `screenshots/` | `{390,1280}-01` first question (no prompt), `-02` completion with prompt, `-03` signup page reached from the prompt, `-04` after **Not now**, `-05` after Play again + reload (still dismissed), `-06` signed-in completion (no prompt) |
| `prompt-events-sent.json` / `analytics-requests.json` | every `POST /api/analytics/events` body and response captured in the browser |
| `db-prompt-events.txt` | rows read back from `AnalyticsEvents` via `docker exec psql` |
| `local-stack/` | trimmed API log (DB command lines removed), IdP/Vite logs, raw script output, session map |

**Results**

- No prompt on the first question; the `save-progress` prompt appears on the anonymous **Quiz complete** summary at both sizes with no horizontal scroll.
- **Create a free account** lands on `/signup?returnTo=<the quiz URL>&reason=save-progress`; `returnTo` equals the quiz path and query. The signup page there shows **"Make your next quiz yours"** / "Quiz scores are not saved to accounts yet. Create a free account to bookmark public collections and build private practice sets.". It does not contain "Keep this result", "stays saved" or "in this browser" (`-03-signup-from-prompt.png`).
- **Not now** hides it and leaves the score and actions untouched; it stays hidden after **Play again** and after a reload in the same tab.
- Signed in (API saw `IsAuthenticated = true`), the completion summary has no prompt and no prompt events are sent.
- DB: each anonymous session stored exactly one `signup_prompt_viewed` (the dismissal sessions had two completions and a reload, still one), and the click sessions one `signup_prompt_clicked`. Every prompt row has context `auth` / `save-progress`, no user id, no run/score/item, a path without query string, and dedupe key `…:client:prompt:save-progress`. The PII-marker query returns 0.

**Review fix:** the first run showed that the signup page reached from the prompt said "Keep this result / Your result stays saved in this browser for now". That is untrue: a signed-in return does not restore the guest run (AC 3.6.12). Commit e2b03e5 replaces it, and this re-run proves the new copy at both sizes.
