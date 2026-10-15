# #121 internal-traffic exclusion: evidence (2026-10-15)

Validated code: `main` at `a9850c8`, which contains #137 (squash `e3f0af3`). The local stack ran from branch `test/121-http-authorization` (`main` plus tests only; application code identical to `main`).

| Folder | Kind | What |
|---|---|---|
| `local-stack/` | **Local integration, real browser and real HTTP** | The unmodified API from `main` on Kestrel against a throwaway `postgres:17.6` container (all 21 migrations applied from empty), plus the Vite SPA and headless Chromium with a normal Chrome UA. **Identity came from a local test issuer (`stack-scripts/fake-oidc.cs`), not Cognito**: the API's JWT bearer validation and `Admin` policy ran unchanged, with only `Authentication:Cognito:Authority` pointed at the local issuer. `results.json` holds the pass/fail checks, `page-view-requests.json` every captured `POST /analytics/page-views`, and `db-page-views.txt` the stored rows. |
| `screenshots/` | Local integration | Original and `-highlighted` copies (red outline added only in the copy). |
| `local-stack/playwright-smoke-*.txt` | Local integration | Repo specs `home.spec.ts` and `categories.spec.ts` (smoke project, `--no-deps`, empty storage state) against the local SPA, before and after the `home.spec.ts` fixture fix. |
| `local-stack/marker-guard-*.txt` | Unit (repo guard) | `PlaywrightInternalMarkerTests` fails on the original `home.spec.ts` and passes after the fix. |
| `tests/` | Integration (CI) | Full `dotnet test` on the tests branch, and a mutation run: with the `Admin` policy removed, the new HTTP tests fail. |

Not covered here: a real Cognito login (blocked for agent use in this session) and production. The production Playwright smoke is still pending.
