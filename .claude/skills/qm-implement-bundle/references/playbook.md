# qm-implement-bundle playbook

Read with the manifest open (`<main checkout>/.qm/bundles/<id>/manifest.json`). `BUNDLE` = `node <skill dir>/scripts/bundle.mjs`. Repo rules from AGENTS.md and CLAUDE.md still apply; this file only adds what bundling changes.

## Why the release is shaped this way

- `CI` runs on every `pull_request` (any base branch) and on `push` to `main` only. `Deploy` runs via `workflow_run` after `CI` succeeds on `main`. So every merge to `main` deploys production, and every PR costs a full CI run.
- `main` is protected: PR required (0 approvals), required checks `build-test-publish`, `CodeQL`, `automation-contract`, strict (branch must be up to date), no force pushes.
- Therefore: issue branches are merged into the release branch **locally** (no per-issue PRs, no extra CI runs), only the release branch is pushed, and exactly one PR targets `main`. That gives one CI cycle for the combined code and one production deploy.

## Branches

- Release branch `branches.release` (`release/<id>`), created from `source.commit` or the current `origin/main` (see Drift). Issue branches `bundle/<id>/<n>-<slug>` from the release branch tip.
- Before creating anything: `git ls-remote --heads origin "release/<id>"`, `git branch --list "release/<id>" "bundle/<id>/*"`, `gh pr list --head release/<id> --state all --json number,state,url`. Reuse what exists; never create a second PR.
- Worktree: `C:\Projects\Quizymode-wt-bundle-<id>` (one per bundle, per AGENTS.md; check free disk space first; if below 15 GB, record an `environmental` blocker and stop). Create with `git worktree add <path> -b release/<id> <base-sha>` or attach the existing branch. All code work happens there; the user's main checkout is never touched.
- Note: `.claude/skills` may be untracked, so it may not exist inside the worktree. Always call `BUNDLE` by the absolute skill path. Bundle files are found through the git common dir, so they resolve from the worktree too.
- Run git in the worktree as `git -C C:/Projects/Quizymode-wt-bundle-<id> <args>` rather than `cd ... &&` chains, so the pre-approved rule matches and the shell cwd does not matter.

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
- Issue body changed (`issues.changed`): ask `qm-decision-maker` whether the approved ACs still match. `proceed` keeps the approved ACs exactly; `defer` defers the issue. The new text never expands scope.
- `origin/main` moved: with `stop-on-any`, phase `blocked_terminal` (kind `source-drift`). With `proceed-unless-overlap`, base the release branch on current `origin/main`; for each issue listed in `drift.overlapping`, ask `qm-decision-maker` whether the approved plan still holds, then follow its outcome.

## Per-issue loop

Every `BUNDLE` call below also takes `--holder <h>` (from `state-init`). For each issue in `order` (skip `integrated`, `released`, `verified`, `closed`, `deferred`, `skipped_already_done`):

1. `BUNDLE checkpoint <id>`.
2. Dependencies: if any `dependsOn` issue is `deferred`, `blocked`, or `failed`, set this issue `deferred` (kind `dependency`) and move on. External dependencies that are not satisfied are `dependency` blockers.
3. `BUNDLE attempt <id> <n>` (exit 3: set `failed`, record `limit`, move on).
4. `BUNDLE issue <id> <n> in_progress --branch bundle/<id>/<n>-<slug>`; create or switch to that branch from the release tip.
5. Plan and build with the specialist agents, scaled to `risk`: architect (plan against the manifest ACs, not the raw issue), ux-designer only when `ux: true`, reviewer plan pass when `risk` is `medium` or `high`, coder (one at a time in the worktree), tester. Give each agent the manifest excerpt for the issue, including `exclusions`, and tell it not to ask the user. For small low-risk issues you may do the architect step inline.
6. Validate each AC with the evidence type it names. Run the issue's `validation` commands. A failing check is fixed or the attempt fails; it is never waived, skipped, or marked expected. Store screenshots and logs outside the repo (scratchpad) until publishing.
7. Commit on the issue branch (conventional commit referencing `#<n>`), set `implemented` then `validated`.
8. `git switch release/<id>` and `git merge --no-ff bundle/<id>/<n>-<slug>`. Resolve conflicts against the combined code, re-run the affected tests, then `BUNDLE issue <id> <n> integrated --commit <sha>`.

A failure inside an attempt goes back to step 3. Only validated issues are merged, so the release branch always holds shippable work.

## Integration

1. Partial release: if any issue is not `integrated` and `partialRelease` is `all-or-nothing`, phase `blocked_terminal` and stop. Otherwise the release ships only integrated issues; deferred ones stay open with a comment saying why (posted at the end).
2. On the release branch, once: bump `QuizymodeVersion` in `Directory.Build.props` per `versionBump` (raise to `minor` if any shipped issue is a feature), align `src/Quizymode.Web/package.json`, make `docs/AC.md` consistent across issues, regenerate OpenAPI with `.\scripts\verify-openapi.ps1 -Configuration Release` when any API surface changed.
3. Run every `releaseGates` check on the combined branch (`dotnet test`, `npm run lint`, `npm run build`, `npm run test:coverage`, plus the pre-push workflow in `.agent-skills/quizymode-prepush/SKILL.md`).
4. Reviewer final pass on `git diff origin/main...release/<id>` in a fresh context. CONFIRMED findings are fixed (counts as an attempt on the affected issue) and gates re-run.
5. Phase `validating` then continue.

## Release

1. `BUNDLE checkpoint <id>`; `BUNDLE ci-run <id>`; `git push -u origin release/<id>`.
2. PR (only if none exists): `gh pr create --base main --head release/<id> --title "release(<id>): <title> (<version>)" --body <file>`. Body lists each issue as `Refs #n` (not `Closes`, so merge does not close issues before evidence), the shipped/deferred table, and the gate results. Phase `release_pr_open --pr <n>`.
3. `gh pr checks <n> --watch`. On failure: read the failing job log (`gh run view <run> --log-failed`), fix on the release branch, re-run local gates, `BUNDLE ci-run`, push. Exit 3 from `ci-run`: phase `blocked_terminal`. When green: phase `ci_green`.
4. `releaseMode: release-pr-only`: phase `done` with the PR link. Stop.
5. `auto-merge-deploy` (requires `authorization.mergeToMain: true`):
   - Record the last deployed SHA for rollback: `gh run list --workflow Deploy --status success --limit 1 --json headSha` gives `--previous-main-sha` (fall back to `git rev-parse origin/main` only if there is no successful run, and note it).
   - If the PR is behind `main` (strict protection), merge `origin/main` into the release branch, re-run gates, push (`ci-run`), wait for green again, and set phase `ci_green` again.
   - `BUNDLE merge-gate <id> --pr <n> --holder <h>`. Only on exit 0: `gh pr merge <n> --merge` (never `--admin`, never `--auto`). Immediately record `--merge-sha` from `gh pr view <n> --json mergeCommit` with phase `merged`, and set each shipped issue to `released`.
   - Wait for `CI` on the merge SHA (`gh run list --workflow CI --branch main --json databaseId,headSha,status,conclusion --limit 5`, match `headSha`, `gh run watch <id>`; allow 45 minutes). If CI on main fails, no deploy happens: record `check-failed`, phase `blocked_terminal`, do not roll back (production is unchanged), report the failing job.
   - Then the `Deploy` run for the same `headSha` (allow 10 minutes to appear and 30 to finish). It never appearing is an `environmental` blocker. Phase `deployed --deploy-run <id>`.
   - Run `postDeploy.checks` (for example `node scripts/wait-for-production-ready.js --expected-build-version <version>`), then verify each shipped issue's ACs on production. Use Grafana and read-only SQL only as authorized. Never type passwords into prod login (if a check needs a signed-in session and none exists, that AC is BLOCKED, not passed).
   - Rollback trigger hit and `authorization.rollback` is `rollback-workflow`: `gh workflow run rollback.yml -f previous_sha=<previousMainSha> -f failed_sha=<mergeSha>`, watch it, record a `check-failed` blocker, phase `blocked_terminal`. With `report-only`, record the exact command instead.
   - Evidence: post one `Acceptance Evidence` comment per issue (reporter agent; AGENTS.md § Issue Closure Evidence) and set the issue `verified`. Close the issue when every AC is verified and `closeIssues` is true, then set it `closed`; otherwise follow AGENTS.md § Post-Deploy Verification and Follow-up (file the follow-up issue; it is not added to this bundle).
   - Comment on each deferred issue with the factual reason.
   - Phase `verified`, then `done` (all shipped and verified) or `done_partial`.
6. Remove the worktree with `git worktree remove` once the PR is merged or closed (no `--force` with uncommitted changes).

## Terminal status

When you cannot continue: set the phase (`blocked_terminal`, or leave `cancelled` as set by the user), make sure every blocker is recorded, and reply with the final report from SKILL.md. State what is done, what is not, and the single next action the user can take. Do not claim completion for anything not verified.
