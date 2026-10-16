# #107 anonymous home quick-quiz entry: evidence (2026-10-16)

Local stack on `main` 4374986 (unmodified API + throwaway postgres:17.6 seeded from data/seed-dev + Vite SPA + headless Chromium, empty browser context). Not production.

- `evidence-107.mjs`: the browser script. `local-stack/results.json` and `run.log`: its results (one FAIL: 200% zoom at 195x422).
- `overflow-probe.mjs`: confirms real horizontal scroll at 195/260/320 px wide.
- `local-stack/vitest-homepage.txt`: HomePage component tests. `local-stack/playwright-home-smoke.txt`: the repo's anonymous smoke spec failing locally (strict-mode locator).
- `screenshots/`: unmodified screenshots.
