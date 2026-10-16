# Issue #134 (PERF-001) route-level code splitting evidence

Branch `feat/134-route-splitting`, `npm run build` (Vite production), measured 2026-10-16.

| Main chunk `index-*.js` | Raw | Gzip |
|---|---|---|
| Before (origin/main 3.58.1) | 975.42 kB | 257.71 kB |
| After | 679.78 kB | 190.41 kB |

Full chunk lists: `build-before.txt`, `build-after.txt`.

Browser check: Playwright Chromium (390x844) against `vite preview` on 127.0.0.1:7134; every non-local request (API, Cognito, analytics) was stubbed, so nothing reached production. Script: `playwright-run.cjs`; results: `results.json`; per-step JS/CSS requests: `network-chunks.tsv`.

- `/` and `/quiz` load only `index`, `vendor`, `query` and CSS: no admin/authoring/study guide/community/legal chunks.
- Client navigation to `/about` fetched only `AboutPage-*.js` and rendered inside the layout.
- `RoadmapPage-*.js` blocked: one automatic reload, then "This page failed to load" + Retry (no loop); unblocked + Retry rendered the Roadmap page.

Not covered: Lighthouse mobile runs, admin routes with a real signed-in admin, quiz with real items (stub returned no items).
