# qm-bundle-ship playbook

Read with the manifest open (`<main checkout>/.qm/bundles/<id>/manifest.json`). `BUNDLE` = `node <main checkout>/scripts/bundle/bundle.mjs`. Repo rules from AGENTS.md and CLAUDE.md still apply; this file only adds what bundling changes.

## Why the release is shaped this way

- `CI` runs on every `pull_request` (any base branch) and on `push` to `main` only. `Deploy` runs via `workflow_run` after `CI` succeeds on `main`. So every merge to `main` deploys production, and every PR costs a full CI run.
- `main` is protected: PR required (0 approvals), required checks `build-test-publish`, `CodeQL`, `automation-contract`, strict (branch must be up to date), no force pushes.
- Therefore: issue branches are merged into the release branch **locally** (no per-issue PRs, no extra CI runs), only the release branch is pushed, and exactly one PR targets `main`. That gives one CI cycle for the combined code and one production deploy.

## Branches

- While a release batch or bundle is active, a session that is not the integrator pushes issue branches only. It does not open a PR to `main`, bump the version, or edit `docs/AC.md` or the OpenAPI file; it writes AC text to `.qm/ac-fragments/<issue>.md`. The integrator assigns AC ids and the single version at integration and checks `gh pr list --base main --state open` before opening the release PR.
- Release branch `branches.release` (`release/<id>`), created from `source.commit` or the current `origin/main` (see Drift). Issue branches `bundle/<id>/<n>-<slug>` from the release branch tip.
- Before creating anything: `git ls-remote --heads origin "release/<id>"`, `git branch --list "release/<id>" "bundle/<id>/*"`, `gh pr list --head release/<id> --state all --json number,state,url`. Reuse what exists; never create a second PR.
- Worktrees: persistent, reused across bundles, never one per bundle: `C:\Projects\Quizymode-wt-lane-a`, `C:\Projects\Quizymode-wt-lane-b` (issue work) and `C:\Projects\Quizymode-wt-release` (release branch and integration). Create each only if missing (`git worktree list`), then `git switch` it to the needed branch (check free disk space first; if below 15 GB, record an `environmental` blocker and stop). Each gets a `node_modules` junction to the main checkout: `cmd /c mklink /J <worktree>\src\Quizymode.Web\node_modules C:\Projects\Quizymode\src\Quizymode.Web\node_modules`. Remove a junction only with `rmdir` (never a recursive delete), and never run `npm ci` in a worktree that has the junction. All code work happens in these worktrees; the user's main checkout is never touched.
- Note: `.claude/skills` may be untracked, so it may not exist inside the worktree. Always call `BUNDLE` by the absolute skill path. Bundle files are found through the git common dir, so they resolve from the worktree too.
- Run git in the worktree as `git -C C:/Projects/Quizymode-wt-lane-a <args>` (or `-wt-lane-b`, `-wt-release`) rather than `cd ... &&` chains, so the pre-approved rule matches and the shell cwd does not matter.

## Reconcile (on every start, including resume)

| Observed | Action |
|---|---|
| Issue `in_progress`, its branch has commits | Continue on that branch; do not restart from scratch. |
| Issue branch already merged into release (`git branch --merged release/<id>`) but state is below `integrated` | Set `integrated`. |
| Release PR exists and is open | Record `--pr`; continue from the matching phase. |
| Release PR merged (state below `merged`, e.g. a crash right after `gh pr merge`) | `BUNDLE phase <id> merged --merge-sha <sha> --holder <h>`; go to deploy watch. Never merge again. |
| Phase `blocked_terminal` and the user ran `resume` | `state-init --take-over` reopened it at the phase before the block; re-check the recorded blocker first and stop again if it still holds. |
| Release PR closed unmerged | Record a `check-failed` or `environmental` blocker with the reason from the PR; phase `blocked_terminal`. Do not reopen silently. |
| Deploy run for the merge SHA exists | Record `--deploy-run`; watch it instead of triggering anything. |
| Issue already has an `Acceptance Evidence` comment from this bundle | Do not post another; close if authorized and not closed. |

## Drift

From `state-init`/`verify` output:

- Issue closed since refinement: mark `skipped_already_done` with a note (check the closing PR); do not reopen.
- `gh` could not read an issue (`issues.unreadable`, `stopForDrift: true`): `environmental` blocker, phase `blocked_terminal`; without GitHub access nothing can ship.
- Issue body changed (`issues.changed`): ask `qm-lead` whether the approved ACs still match. `proceed` keeps the approved ACs exactly; `park` parks the issue; `proceed-flagged` keeps them and flags the decision for review. The new text never expands scope.
- `origin/main` moved: with `stop-on-any`, phase `blocked_terminal` (kind `source-drift`). With `proceed-unless-overlap`, base the release branch on current `origin/main`; for each issue listed in `drift.overlapping`, ask `qm-lead` whether the approved plan still holds, then follow its outcome.

## Per-issue loop

Every `BUNDLE` call below also takes `--holder <h>` (from `state-init`). For each issue in `order` (skip `integrated`, `released`, `verified`, `closed`, `deferred`, `skipped_already_done`):

1. `BUNDLE checkpoint <id>`.
2. Dependencies: if any `dependsOn` issue is `deferred`, `blocked`, or `failed`, set this issue `deferred` (kind `dependency`) and move on. External dependencies that are not satisfied are `dependency` blockers.
3. `BUNDLE attempt <id> <n>` (exit 3: set `failed`, record `limit`, move on).
   Then `BUNDLE packet <id> <n>` writes `.qm/packets/<n>.md` (the packet lists each role's model from one routing function; haiku by default; sonnet and opus only on a scored complexity criterion (AC 7.13.3)). Dispatch each specialist with the packet path and its role's model; save its reply JSON with `BUNDLE handback-save <id> --issue <n> --role <role> --file <json>` and read `.qm/handbacks/<n>-<role>.json`, not its prose.
4. `BUNDLE issue <id> <n> in_progress --branch bundle/<id>/<n>-<slug>`; create or switch to that branch from the release tip.
5. Plan and build with the specialist agents, scaled to `risk`: `low` and content-only issues are coder-only (plan inline); `medium` is architect + coder + tester; `high` keeps the full pipeline (architect against the manifest ACs, not the raw issue; ux-designer only when `ux: true`; reviewer plan pass; coder, one at a time per worktree; tester). Give each agent the manifest excerpt for the issue, including `exclusions`, and tell it not to ask the user.
6. Validate each AC with the evidence type it names. Run only filtered checks: `dotnet test --filter "(FullyQualifiedName~Features.<Feature>|FullyQualifiedName~Architecture)&Category!=Postgres"` per touched feature folder (`tests/Quizymode.Api.Tests/Features/<Feature>` mirrors `src/Quizymode.Api/Features/<Feature>`); `npx vitest related --run <changed files>`; `eslint <changed files>`. Widen to the full project only when the change touches `Shared/`, `Services/`, `StartupExtensions/`, `Data/` or migrations, `src/test/setup.ts`, `api/`, `contexts/`, `hooks/`, or a config file. Always run the Architecture tests and `ac-gate --issues`; run `node --test scripts/tests/ac-validation.test.mjs` when `docs/AC.md` or `playwright/` changed, `PlaywrightInternalMarkerTests` when `playwright/` changed, and `verify-openapi.ps1` when the API surface changed. Never run full suites or coverage per issue. A full-suite command in a manifest's `validation` is not run per issue; CI runs full suites on the release PR. A failing check is fixed or the attempt fails; it is never waived, skipped, or marked expected. Store screenshots and logs outside the repo (scratchpad) until publishing.
7. Commit on the issue branch (conventional commit referencing `#<n>`), set `implemented` then `validated`.
8. `git switch release/<id>` and `git merge --no-ff bundle/<id>/<n>-<slug>`. Resolve conflicts against the combined code, re-run the affected tests, then `BUNDLE issue <id> <n> integrated --commit <sha>`.

A failure inside an attempt goes back to step 3. Only validated issues are merged, so the release branch always holds shippable work.

## Lanes

- `BUNDLE lanes <id>` (read-only) splits the not-yet-integrated issues into `laneA` and `laneB`. Issues whose `scope.paths` do not overlap and have no `dependsOn` link run concurrently, one coder per lane worktree (`BUNDLE issue ... --lane a|b` records it). All `migration: true` issues go in one lane. When it reports overlap or dependency, those issues stay in one lane in `order`.
- Only one `dotnet build`, `dotnet test`, or `verify-openapi.ps1` runs at a time across lanes (a mutex, for example a lock file in the scratchpad).
- Lanes never edit `Directory.Build.props`, the `package.json` version, `docs/AC.md` (write an AC fragment to `.qm/ac-fragments/<n>.md` for the integrator instead), or `docs/openapi/quizymode-api.json`. Only the integrator does, in § Integration.
- Lane branches merge into the release branch one at a time, in `order`, by the integrator.

## Integration

1. Partial release: if any issue is not `integrated` and `partialRelease` is `all-or-nothing`, phase `blocked_terminal` and stop. Otherwise the release ships only integrated issues; deferred ones stay open with a comment saying why (posted at the end).
2. On the release branch, once: skip the bump and the `docs/AC.md` edit when every shipped issue changes only `data/seed-source/items/**` and `_registry/**` (AGENTS.md exemption, AC 7.11.5; gate those issues with `--no-ac`); otherwise bump `QuizymodeVersion` in `Directory.Build.props` per `versionBump` (raise to `minor` if any shipped issue is a feature), align `src/Quizymode.Web/package.json`, make `docs/AC.md` consistent across issues, regenerate OpenAPI with `.\scripts\verify-openapi.ps1 -Configuration Release` when any API surface changed.
3. Once on the release branch: `npm run build` (`tsc -b`), one filtered `dotnet test` and one `npx vitest related --run` over all shipped issues, the prepush scans, and `ac-gate --issues`. Full suites run in CI on the release PR.
4. Reviewer final pass on `git diff origin/main...release/<id>` in a fresh context. CONFIRMED findings are fixed (counts as an attempt on the affected issue) and the filtered tests for the files the fix touched are re-run.
5. Phase `validating` then continue.

## Release

Steps 3 to 5 below are driven by `node scripts/release/release.mjs`: `wait-pr --pr <n>` (step 3, until `ok`), `ship --pr <n> --issues <n,n>` (merge and deploy check, run again until `deployed`), and `evidence --issues <n,n> --report ... --run-url ... --out ...` (then `--close` only after the evidence comments are posted). Each prints one JSON line with `class`; exit 3 means the same failure as last time, and a `deploy` class writes `.qm/release-halt.json`. `BUNDLE merge-gate` still gates the merge.

1. `BUNDLE checkpoint <id>`; `BUNDLE ci-run <id>`; `git push -u origin release/<id>`.
2. PR (only if none exists): `gh pr create --base main --head release/<id> --title "release(<id>): <title> (<version>)" --body <file>`. Body lists each issue as `Refs #n` (not `Closes`, so merge does not close issues before evidence), the shipped/deferred table, and the gate results. Phase `release_pr_open --pr <n>`.
3. Run `gh pr checks <n> --watch` (and later `gh run watch`) in the background; while waiting, lanes may implement the next approved bundle's issues on branches (no second release PR while one is in flight; all gates unchanged). On failure: read the failing job log (`gh run view <run> --log-failed`), fix on the release branch, re-run the filtered tests for the files the fix touched, `BUNDLE ci-run`, push. Exit 3 from `ci-run`: phase `blocked_terminal`. When green: phase `ci_green`.
4. `releaseMode: release-pr-only`: phase `done` with the PR link. Stop.
5. `auto-merge-deploy` (requires `authorization.mergeToMain: true`):
   - Record the last deployed SHA for rollback: `gh run list --workflow Deploy --status success --limit 1 --json headSha` gives `--previous-main-sha` (fall back to `git rev-parse origin/main` only if there is no successful run, and note it).
   - If the PR is behind `main` (strict protection), merge `origin/main` into the release branch, re-run the filtered tests for the files the fix touched, push (`ci-run`), wait for green again, and set phase `ci_green` again.
   - `BUNDLE merge-gate <id> --pr <n> --holder <h>`. Only on exit 0: `gh pr merge <n> --merge` (never `--admin`, never `--auto`). Never merge a PR while any required check (including ac-gate) is failing or pending. Immediately record `--merge-sha` from `gh pr view <n> --json mergeCommit` with phase `merged`, and set each shipped issue to `released`.
   - Wait for `CI` on the merge SHA (`gh run list --workflow CI --branch main --json databaseId,headSha,status,conclusion --limit 5`, match `headSha`, `gh run watch <id>`; allow 45 minutes). If CI on main fails, no deploy happens: record `check-failed`, phase `blocked_terminal`, do not roll back (production is unchanged), report the failing job.
   - Then the `Deploy` run for the same `headSha` (allow 10 minutes to appear and 30 to finish). It never appearing is an `environmental` blocker. Phase `deployed --deploy-run <id>`.
   - Run `postDeploy.checks` (for example `node scripts/wait-for-production-ready.js --expected-build-version <version>`), then verify each shipped issue's ACs on production. Use Grafana and read-only SQL only as authorized. Never type passwords into prod login (if a check needs a signed-in session and none exists, that AC is BLOCKED, not passed).
   - Rollback trigger hit and `authorization.rollback` is `rollback-workflow`: `gh workflow run rollback.yml -f previous_sha=<previousMainSha> -f failed_sha=<mergeSha>`, watch it, record a `check-failed` blocker, phase `blocked_terminal`. With `report-only`, record the exact command instead.
   - Evidence: post one `Acceptance Evidence` comment per issue (reporter agent; AGENTS.md § Issue Closure Evidence) and set the issue `verified`. Close the issue when every AC is verified and `closeIssues` is true, then set it `closed`; otherwise follow AGENTS.md § Post-Deploy Verification and Follow-up (file the follow-up issue; it is not added to this bundle).
   - Comment on each deferred issue with the factual reason.
   - Phase `verified`, then `done` (all shipped and verified) or `done_partial`.
6. Keep the persistent worktrees; once the PR is merged or closed, switch them to a clean detached `origin/main` so the next bundle reuses them. Remove a worktree with `git worktree remove` only if it is broken (no `--force` with uncommitted changes; remove node_modules junctions with `rmdir` first).

## Terminal status

When you cannot continue: set the phase (`blocked_terminal`, or leave `cancelled` as set by the user), make sure every blocker is recorded, and reply with the final report from SKILL.md. State what is done, what is not, and the single next action the user can take. Do not claim completion for anything not verified.
