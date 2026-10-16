# #133 OBS-001 front-end error reporting: evidence (2026-10-16)

Validated code: branch `feat/133-frontend-error-reporting` at `37104f7` (PR for #133), app version 3.58.0.

| Folder | Kind | What |
|---|---|---|
| `local-stack/` | **Local integration, real browser and real HTTP** | The API from the branch on Kestrel (`https://localhost:8082`, Development) against a throwaway `postgres:17.6` container `qm-ev-133` (all migrations, including `AddClientErrors`, applied from empty), the Vite dev SPA on `:7000`, and headless Chromium (Playwright 1.5x via `createRequire`) with a normal Chrome UA. **Signed-in identities came from a local test issuer (`stack-scripts/fake-oidc.cs`), not Cognito**: the API's JWT validation and `Admin` policy ran unchanged, only `Authentication:Cognito:Authority/ClientId/Audience` pointed at the local issuer. |
| `screenshots/` | Local integration | Fallback UI, admin page, and renders of the captured network log, stored rows, and HTTP checks. |
| `tests/` | Unit/integration (CI-equivalent) | Per-test output of the new xUnit and Vitest tests. |

## How errors were triggered (real browser, no app test hooks)

| Kind | Trigger | Source sent |
|---|---|---|
| Render error | Playwright served a malformed `GET /api/featured` (`{"sets":{"length":1}}`), so `HomePage` crashed in render (`featuredSets.map is not a function`) and the root `ErrorBoundary` showed its fallback | `boundary` |
| Plain runtime error | `setTimeout(() => { throw new Error("Evidence runtime error for jane.doe@example.com at https://localhost:7000/quiz?token=SECRET123#frag") })`, five times | `window` |
| Unhandled rejection | `Promise.reject(new Error("Evidence unhandled rejection"))` | `promise` |
| Chunk load failure | `import("/assets/missing-chunk-Ab12Cd34.js?sig=SECRET456")` (404) and an appended `<script src="/assets/legacy-missing-Zz99Yy88.js?sig=SECRET789">` (404) | `promise` / `window` (`ChunkLoadError`) |
| Error loop | 15 distinct errors thrown in the same tab | `window` |

## Results (`local-stack/results.json`, 22/22 PASS)

- Render error stored once with component stack, path `/` (the visit URL carried `?utm_source=...&email=...`), app version 3.58.0, and the page-view session id: `screenshots/01-render-error-fallback.png`, `05-network-requests.png`, `06-db-rows.png`.
- Runtime error, rejection, dynamic-import failure and `<script>` failure each captured. Same runtime error thrown 5 times: 1 request, 1 row.
- One tab sent exactly 10 reports. The 6th to 15th flood errors were never sent, and the tab stored 10 rows.
- Anonymous reports went as `sendBeacon` (`ping`, `text/plain`). The signed-in member's report went as a `fetch` with `application/json` and a bearer token. The token is never written to these files; only `bearer: true` is.
- Invalid payloads (unknown source, absolute path, blank message, bad session id, non-JSON) returned 400, a 40 KB body returned 413, and the row count did not change.
- HTTP flood of 40 valid reports, each with a new session: the first 13 got 202 (the IP partition's remaining budget of 30 per 10 minutes, after the browser's and invalid requests), the next 27 got 429, and exactly 13 rows were added (`07-http-validation-and-rate-limit.png`).
- No stored path contains `?` or `#`. No row contains `SECRET`, `token=`, `sig=`, or an email. The message was stored as `Evidence runtime error for [email] at https://localhost:7000/quiz`.
- Internal traffic per #121: the row from the marked browser has `IsInternal = true`; anonymous and member rows are `false`. `GET /admin/client-errors` leaves the marked session out by default (`internalSessions: 1`) and includes it with `includeInternal=true`.
- Admin report: anonymous 401, member 403. As admin, the HTTP flood rows form one group (count 13, 13 sessions). UI: `03-admin-client-errors.png`, and `04-admin-render-error-group-expanded.png` (sample stack, component stack, sample-session journey). A non-admin who opens `/admin/client-errors` is redirected to `/`.
- Bounds (`local-stack/truncation-check.txt`): a 16 KB report with oversized fields was accepted (202) and stored truncated to 100/500/4000/2000/512 characters. Its `?q=` and `?key=SECRETKEY` were stripped.
- Structured logs: `serilog-client-error-json.txt` has 25 events from a local JSON console sink, added for this run through `APP_Serilog__WriteTo__0__*` env config. Each event carries `ClientErrorFingerprint` and `ClientAppVersion`. **This shows the Serilog events, not Grafana Loki.** Loki was not configured locally.
- Source maps (`sourcemaps-build-check.txt`): the build produced 3 `.map` files, and 0 bundles reference them.

## Not covered

- Grafana Loki ingestion (needs production credentials), and that the deployed site serves no `.map`. Production was not touched. The S3 exclusion is a config change in `deploy.yml` and `scripts/deploy-to-s3.ps1`.
- A real Cognito login. A local test issuer was used instead.
- Production builds: the browser run used the Vite dev server, so the stacks point at `/src/...` modules rather than minified bundles.
