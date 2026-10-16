# Evidence: #151 (home horizontal overflow on phones at 200% zoom) and #152 (ambiguous smoke locator)

- **Fix branch:** `fix/151-152-home-overflow-smoke`, commit `bb9b50f` (base `origin/main` `51c62be`).
- **Date:** 2026-10-16.
- **Environment: local stack only, nothing touched production.** API from the fix worktree against a throwaway
  `postgres:17.6` container (port 54399, auto-seeded from `data/seed-dev`), Vite dev server on :7000,
  headless Chromium from `@playwright/test` with a normal desktop Chrome user agent and a fresh context per viewport.

## Root cause (#151, verified)

`measure-overflow.mjs` lists elements whose box passes the right edge of the viewport and are not clipped by an
overflow container. Before the fix the only such elements were the three decorative hero shapes in `HomePage.tsx`
(`skew-x-[-24deg]`, `rotate-12`, `-rotate-12`, inside an `absolute inset-0` layer with no clipping); their right edges
were 230-247 px at 195 wide. The hero section grows when the featured/collections lanes render, which stretches the
rotated shapes further, so the overflow depends on load timing (an early, discarded run on a cold API read 34/7/13 px;
the recorded run after data loaded matches the issue exactly). Fix: `overflow-hidden` (plus `aria-hidden`) on that layer.

## Results (`results-before.json`, `results-after.json`, `raw-before.txt`, `raw-after.txt`)

| Viewport | Before: scrollWidth / overflow / max scrollX | After: scrollWidth / overflow / max scrollX | CTA visible + inside (after) |
|---|---|---|---|
| 195x422 | 247 / **52 px** / 52 | 195 / 0 / 0 | yes |
| 260x450 | 288 / **28 px** / 28 | 260 / 0 / 0 | yes |
| 320x568 | 333 / **13 px** / 13 | 320 / 0 / 0 | yes |
| 390x844 | 390 / 0 / 0 | 390 / 0 / 0 | yes |
| 1280x900 | 1280 / 0 / 0 | 1280 / 0 / 0 | yes |

After the fix no unclipped element extends past the right edge at any viewport.

## Tests

- `playwright-smoke-before.txt`: the original `AC 3.0 @smoke` spec (from `origin/main`) fails with the strict-mode
  violation (`getByText('Question')` resolves to the collection description and the `<h3>Question</h3>`).
  Screenshot: `screenshots/before-smoke-strict-mode-failure.png`.
- `playwright-smoke-after.txt`: the fixed spec, `--project=smoke`: 1 passed.
- `playwright-home-spec-guard-on-unfixed-homepage.txt`: the new width-check tests run against the **unfixed**
  `HomePage.tsx`: 195/260/320 fail (received scrollWidth 247, 288, 333), exactly as measured (390 passes), proving the guard catches the bug.
- `playwright-home-spec-after-x3.txt`: whole `home.spec.ts` with the fix, `--project=e2e-full --repeat-each=3`: 15 passed.
  Screenshot of the quiz reached by the smoke: `screenshots/after-smoke-quiz-question.png`.
- `vitest-homepage.txt`: `HomePage.test.tsx` 7 passed (includes the new decor-clipping test). Full frontend suite: 443 passed; `npm run build` passed.

Playwright commands were run from the fix worktree with `PLAYWRIGHT_BASE_URL=http://localhost:7000` and `--no-deps`
(the anonymous home spec does not need the auth-setup project).

## Not run

- The production `@smoke` run after deploy (touches production; needs approval).
- Real phone browsers; zoom is emulated by CSS-pixel viewport width (390 px at 200% = 195 CSS px).
