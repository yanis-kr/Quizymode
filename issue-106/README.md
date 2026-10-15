# #106 / #138 conversion funnel infrastructure: evidence (2026-10-15)

Validated SHA: `feat/106-conversion-event-funnel` at `c350806` (`main` `bda1bd5` merged in; migration regenerated on top of #137).

| Folder | Kind | What |
|---|---|---|
| `migrations/` | Local, isolated `postgres:17.6` container | **Upgrade**: a database already at `main`'s schema with data (21 migrations) applied only `20261015125000_AddAnalyticsEvents` on API startup; existing rows were preserved. **Fresh**: an empty database applied all 22 migrations. Includes the old and new migration bodies (identical), an empty diff between the auto-merged and regenerated model snapshots, and the read-only production history showing the old migration was never applied. |
| `local-stack/http-results.json` | **Local integration, real HTTP** | The #138 API against isolated Postgres. **Identity from a local test issuer (not Cognito)**; JWT validation and the `Admin` policy unchanged. Events were posted **directly to the API**, because page instrumentation is not implemented yet. |
| `screenshots/` | Local integration | Funnel tab (originals and `-highlighted` copies) with data from those direct API calls. |
| `tests/` | Unit / integration | `dotnet test`, `npm run build`, `npm test -- --run` and `npm run lint` on `c350806`. |

Not shown here: page instrumentation, end-to-end telemetry from real UI actions, and production. These are not built yet; see the blocker list on #106.
