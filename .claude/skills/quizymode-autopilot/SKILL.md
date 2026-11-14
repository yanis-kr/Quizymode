---
name: quizymode-autopilot
description: Process Quizymode GitHub issues autonomously within a time window the user gives. Picks issues, decides small questions with an Opus decision agent, implements in two lanes that each work a queue of issues, releases through one integrator (one version bump, one PR, one deploy per batch of 6 to 8 issues), verifies on prod, and stops at the deadline. Use when the user gives a goal (issues or the backlog) and a deadline, asks to keep going, or asks to close as many issues as possible.
---

# Quizymode autopilot

## How this run goes fast

A release has a fixed cost: CI on the PR, CI again on main, Deploy, prod verification. Implementation is cheap by comparison. So the run is shaped around three rules:

- Releases are big. A batch carries 6 to 8 issues, not 1 or 2.
- Lanes never wait for a release. While a batch is in CI, deploy, or prod verification, both lanes are already implementing the next batch.
- The laptop is weak (little RAM, CPU, and disk). CI does the full test run. Local runs are filtered, and only one .NET compile happens at a time.

## Input

- Goal: an explicit issue list, or backlog (open issues labelled `owner:agent` and `status:ready`).
- Deadline: local time with timezone, for example "until 14:00 CST". If missing, ask once; otherwise use it.
- Answers to the upfront big-decision questions. If they are given, do not re-ask.
- Optional: issues owned by another agent window. Skip those and their dependents.

Read AGENTS.md and the section headers of `docs/AC.md` before starting.

## Preflight (run start, before any issue is picked)

- Signed-in prod checks need no browser sign-in. The Deploy job `prod-verify` signs in as the test user and the test admin from repository secrets (AGENTS.md § Verification method per AC). Never type or read passwords, and never start the prod sign-in from the run.
- Check that the secrets exist, by name only: `gh secret list --json name -q '.[].name'` should show `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`. If the admin pair is missing, tell the user once; admin `signed-in-prod-ui` ACs will report BLOCKED until it is added. The run continues.
- Record the result in `<scratch>/state.json` as `prodVerifySecrets: { user: true | false, admin: true | false }`, with the time.

Run one autopilot at a time. A second window merging to main makes every open release PR stale (main requires up-to-date branches) and costs a full CI re-run. If `<scratch>/state.json` from another live session exists, stop and report it.

## Standing permissions

Given by the user for this workflow:

- Create branches and PRs, and merge a green release PR (this deploys prod). Merge only after the evidence gate in § Release.
- Run read-only prod SQL (READ ONLY transaction, never print secrets) and read Grafana.
- Create minimal private test data on prod through the UI, and record exactly what was created.
- Close issues once Acceptance Evidence is attached (AGENTS.md § Issue Closure Evidence).
- Use the post-deploy workflow (AGENTS.md § Post-Deploy Verification) when an AC is not verifiable.
- Make small decisions through the Opus decision agent without asking the user.

Never without an explicit user yes in chat:

- Deleting prod data, including test items and test study guides.
- Changing account settings, roles, or billing; messages or emails outside issue and PR comments.
- Typing real passwords into prod login, or starting the `prod-verify` sign-in from the run. The Deploy job does it. A skipped prod check is BLOCKED, not passed.
- Bypassing CAPTCHAs, `--admin`, `--no-verify`, force-push, or destructive git on the user's uncommitted work.

## Decision policy

Small decisions go to `qm-decision-maker` (Opus, read-only): implementation approach, which tests to add, file placement, AC wording that does not weaken an AC. Give it the question, the issue text, the relevant ACs, and the code it touches. Follow `proceed` and record the question, decision and rationale in `<scratch>/decisions.md`. Never follow `defer`; treat it as a big decision.

Version level is a rule, not a judgment: any new user-visible feature in a release means a MINOR bump; fixes and polish are PATCH.

If a decision depends on prod data (row shapes, backfills, volumes), the orchestrator answers it with read-only prod queries first. If the answer still needs prod data it cannot see, defer.

Big decisions are not delegated. They are asked upfront with one question each and a recommended default. Big means: a product or pricing choice; an irreversible data or schema change; an auth or security model change; a new external service, credential, or cost; anything on the not-permitted list; or any change to what an AC means. A big decision found mid-run parks only that issue (`blocked: needs-user-decision`); other issues keep going.

The reviewer, not the decision agent, confirms that AC wording was not weakened.

## Pick and split

1. `gh issue list --state open --limit 200`. Skip `status:deferred`, `owner:human`, issues blocked by an open issue, issues the user named as owned by another window, and any issue that already has an open PR or a remote `feat/<issue>-*` branch this run did not create.
2. Rate each issue:
   - small: one vertical slice or one screen, no migration, no auth change, no new endpoint.
   - medium: new endpoint, several slices, or new visible surface.
   - high: migration, auth or security, data backfill, or cross-cutting change.
   - Verification method per AC: tag each AC `[verify: <method>]` (AGENTS.md § Verification method per AC). The method decides the evidence. For any signed-in AC, the coder writes the Playwright test in the same change, with `AC <id>` in the test title:
     - `e2e` (default): a spec in `playwright/e2e-ci/`, using the dev test sign-in (AC 7.8, `Authorization: DevTest <userId>`, plus `admin` for admin ACs).
     - `signed-in-prod-ui` (only when the behavior exists only on a deployed site): a spec in `playwright/prod-verify/` using `asUser`, `asAdmin` or `asAnon`. Read-only where possible, never deletes data.

     An untagged AC blocks the issue until it is tagged.
3. Build two lane queues for the whole run, not just the next batch:
   - Prefer one frontend lane and one backend lane, so only one lane compiles .NET. If the backlog does not split that way, fill both lanes and rely on the .NET mutex (§ Local resources).
   - Put related issues (same feature area, same files) in the same lane, in order, so they stack instead of conflicting.
   - Put the shortest and safest issues first so the first batch closes quickly.
4. A batch is one release. Target 6 to 8 issues. Close a batch when any of these is true: it has 8 ready issues; it has at least 4 ready issues and no release is in flight; 90 minutes have passed since its first issue became ready; the deadline rule says so.

## Hot files

Serialised, never edited by two lanes in the same batch: EF migrations and the model snapshot, `docs/quizymode_taxonomy.yaml` and its seed SQL.

- All migration issues go to one lane. A second migration issue in the same batch branches from the first one's branch, so the snapshot stays linear.
- Lanes declare touched files after planning. If the two lanes overlap on any file, move the later issue into the other lane's queue behind the issue it overlaps, instead of resolving at merge.

Integrator-only, never edited or committed by a lane: `Directory.Build.props`, `src/Quizymode.Web/package.json` version, `docs/AC.md`, `docs/openapi/quizymode-api.json`. OpenAPI is generated, so the integrator regenerates it once per release. A lane that needs it locally may generate it but must not stage it.

## Local resources

- Three persistent worktrees, reused for the whole run and across runs so bin/obj stays warm:
  - `C:\Projects\Quizymode-wt-lane-a`
  - `C:\Projects\Quizymode-wt-lane-b`
  - `C:\Projects\Quizymode-wt-release`

  Create one only if it does not exist. Never create a worktree per issue. Never touch the user's checkout or another agent's worktree.
- Node modules: junction (`mklink /J`) to the main checkout's `node_modules`, created once per worktree. Removed only with `rmdir` (no `/S`), never `rm -r` or `rm -f`.
- .NET mutex: one `dotnet build`, `dotnet test`, or `verify-openapi.ps1` at a time across both lanes and the integrator. Every one of them compiles the solution.
- Heavy mutex: Aspire stack, Vite dev server, and Playwright take a second single mutex, one at a time, because they fight over ports 7000, 8082 and 49800 and share one database. Shut them down as soon as the evidence is captured.
- Never run the full `dotnet test`, the Testcontainers Postgres tests, or `npm run test:coverage` locally. CI runs them.
- Never block the orchestrator on a wait. Start `gh pr checks <n> --watch` and `gh run watch <id>` in the background and keep dispatching lane work.

## Lanes (two, each working its queue)

For each issue in the lane's queue:

1. In the lane worktree: `git fetch origin main`, then `git switch -c feat/<issue>-<slug> origin/main`. If the issue depends on an earlier unreleased issue in the same lane, branch from that issue's branch instead.
2. Run the pipeline in `.claude/agents/`, scaled to the rating:
   - small: coder only. The coder plans inline against the issue ACs, implements, and runs the filtered tests itself.
   - medium: architect, coder, tester. Add ux-designer only when there is a new visible surface.
   - high: architect, ux-designer when user-visible, reviewer on the plan, coder, tester, reviewer on the diff.

   Only one coder writes in a worktree at a time. Tell each agent not to ask the user and not to re-read files the orchestrator already summarised for it.
3. Filtered checks only: `npm test -- --run <pattern>`, `dotnet test --filter "FullyQualifiedName~<slice>"` (exclude `Category=Postgres` unless the issue is about that code), a targeted `npm run lint -- <paths>`. Take the .NET mutex for any dotnet command.
4. Write the AC text as a fragment at `<scratch>/ac/<issue>.md` (section heading and the AC lines it adds or changes).
5. Commit on the branch, push it, report ready with the test output, and write the checkpoint.
6. Start the next issue in the queue immediately. Do not wait for the integrator or for a release.

A lane does not: change integrator-only files; open a PR to main; close issues.

## Integrator (one per batch)

The integrator is the only writer of release state. At most one release is in flight (from PR open to merged) at a time. If a batch closes while another release is in flight, its integration starts when that one merges; lanes keep working meanwhile.

1. In the release worktree: `git fetch origin main`, `git switch -c release/<batch-id> origin/main`.
2. Merge each ready lane branch in planned order. If one conflicts, skip it, record it as blocked (it goes to the front of its lane's queue for a rebase), and release the rest.
3. Place each AC fragment into its feature section of `docs/AC.md`. Do not add chunk-named headings.
4. Bump `QuizymodeVersion` once (MINOR if any shipped issue is a feature, else PATCH) and align `src/Quizymode.Web/package.json`.
5. If any API surface changed, regenerate OpenAPI with `.\scripts\verify-openapi.ps1 -Configuration Release`. Never resolve that file by hand.
6. Light local check, under the .NET mutex: `npm run build`; `dotnet build` (skip if step 5 already built); the filtered tests of every shipped issue, in one `dotnet test --filter` and one `npm test -- --run` invocation; the high-risk scans from `quizymode-prepush` (constructor signature changes, removed UI text). Do not run the full suites or coverage here. CI is the full run.

   Then the AC gate: `node scripts/validation/ac-gate.mjs --issues <every shipped issue>`. If an issue fails (an AC with no method, or an `e2e` or `signed-in-prod-ui` AC with no test), revert its merge from the release branch, put it back at the front of its lane's queue with the gate output, and release the rest. An issue that fails the gate does not ship.
7. One reviewer pass on `git diff origin/main...release/<batch-id>` in a fresh context, covering code and that no AC wording was weakened. Confirmed findings are fixed on the release branch.
8. Push and open one PR with `Refs #n` for each shipped issue (not `Closes`, so merging does not close them before evidence exists). Steps 7 and 8 may run in the opposite order to start CI sooner; a reviewer fix is then one more push.

## Release

1. Watch CI on the PR in the background, 45 minute timeout per run. A red PR has three sources, and a failed job log shows only the first, so read all three before fixing:
   - Failed jobs: `gh run view <run> --log-failed`.
   - Code scanning: the required `CodeQL` check fails on a new alert and has no job log. List the PR's alerts with `gh api "repos/{owner}/{repo}/code-scanning/alerts?ref=refs/pull/<n>/merge&state=open"` (rule, path, line).
   - Review comments: `gh api repos/{owner}/{repo}/pulls/<n>/comments` (bots such as `github-advanced-security[bot]` post findings here).

   Fix on the release branch with a test where one fits, push, and reply on each review thread with the fixing commit. Do not dismiss an alert or resolve a thread without a fix; a finding the run believes is a false positive is a big decision (§ Decision policy) and parks the issue that introduced it. Alerts that already exist on main are not this release's to fix; list them in the final report.

   At most two fix pushes; after that drop the offending issue from the release branch if it is identifiable, otherwise mark the batch `environmental` and stop merging. On timeout, rerun once.
2. If main moved, merge `origin/main` into the release branch and wait for green again. This should not happen with one autopilot running.
3. Merge the PR. In the background, watch CI on main and then Deploy. Run postDeploy checks (`node scripts/wait-for-production-ready.js --expected-build-version <version>`).
4. Prod verification is a smoke check, not a re-test. Check the deployed version and `/health` (`node scripts/wait-for-production-ready.js --expected-build-version <version>`), the anonymous pages of the batch's screens, and read-only SQL or curl where an AC needs prod data. Do not re-verify ACs that the CI run already proved (`unit`, `e2e`, `api` tests in CI).
5. Evidence is generated, then completed:
   - Download the two reports: `gh run download <CI run on main> -n e2e-ci-<run number> -D <scratch>/reports/ci` and `gh run download <Deploy run> -n prod-verify-<sha> -D <scratch>/reports/prod`.
   - Run `node scripts/validation/ac-evidence.mjs --issues <shipped issues> --report <scratch>/reports/ci/playwright-report/results.json --report <scratch>/reports/prod/playwright-report/results.json --run-url <CI run URL> --env "CI e2e and prod-verify after deploy of <version>" --out <scratch>/evidence`.
   - For each issue, append the `api`, `sql` and `anon-ui` evidence from step 4 and that issue's decision-log entries to `<scratch>/evidence/issue-<n>.md`, then post it as the Acceptance Evidence comment.
   - Close an issue only when the script marked it complete, or every remaining `NOT RUN` row now has its appended evidence. `FAILED` or `BLOCKED` rows keep the issue open: a `FAILED` row gets a follow-up issue per AGENTS.md, a `BLOCKED` row names what is missing (usually a secret).
   - Subjective checks no test can make go into one checklist comment per batch, grouped by screen, with the exact steps and expected result per item. The owner replies "verified" to close those issues; the run does not close them on its own.
6. If a prod health check fails after deploy: stop, record it, and report. Do not start further merges. Lanes may finish the issue they are on, then stop.

After merge, prod verification always finishes, even past the deadline.

## Deadline

- Start no new issue after deadline minus 30 minutes.
- Close the current batch early enough that its PR and CI can finish before the deadline. Unmerged lane branches stay pushed and are listed in the report.

## Cleanup (every run, including after a stop or deadline)

1. Track every branch the run creates in `<scratch>/worktrees.json` as soon as it is created.
2. Delete local branches that are merged (`git branch -d`). Use `-D` only for an abandoned branch the run itself created and whose PR is closed.
3. Leave the three persistent worktrees in place, each on a detached `origin/main`, unless it has uncommitted work (then leave it as is and report it).
4. Run `Get-PSDrive C`. If free space is below 15 GB: remove the lane and release worktrees that are clean (junction first with `rmdir`, then `git worktree remove`, then `git worktree prune`), and apply the disk-hygiene rule in the user's CLAUDE.md (remove stale task output older than 24 hours and not growing; ask before NuGet, Docker, `.cache` or `.claude`).
5. Never remove a worktree, branch, or folder the run did not create (other agent windows, `.claude/worktrees/*`, the user's checkout).

## Stop conditions

Stop an issue, not the lane, when:

- its tests or checks fail after two attempts (record the output and move to the next issue in the queue);
- it reaches a big decision or a not-permitted action;
- an environmental blocker appears that is specific to it.

Stop the whole run only when the next step needs the user alone, the deadline arrives, a prod health check fails after deploy, or an environmental blocker affects everything (no GitHub access, usage limit).

## Checkpoints (required at every issue boundary)

After each issue finishes or stops, write `<scratch>/checkpoints/<issue>.json` with: issue, status (ready, shipped, verified, closed, parked, blocked, or abandoned), branch, PR number, decisions made for it, the next step, and the time. Also refresh `<scratch>/state.json`, which lists both lane queues, the open batch, the release in flight, and the deadline.

On start, if `<scratch>/state.json` exists and is unfinished, resume from it instead of picking issues again. This lets the run continue in a fresh session after `/compact` or a restart.

Keep `<scratch>/decisions.md`, one entry per decision made without the user: issue, question, decision, reason, and the Opus agent's outcome.

## Status block

Post this block when a batch closes, when a release merges, when prod verification finishes, and in the final report. Do not add it to other messages. Measure memory and disk only then.

```
Batch <id>: <k> ready, <state of the release in flight>
Lane A: #<issue> <step>, <n> queued
Lane B: #<issue> <step>, <n> queued
Decided for you: <count> (latest 3, one line each), full log: <scratch>/decisions.md
Parked for you: <big decisions waiting on the user, or "none">
Free memory: <free GB of total GB> | Free disk C: <free GB> (flag if below 15 GB)
```

Memory: `Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory, TotalVisibleMemorySize` (KB; divide by 1048576 for GB). Disk: `Get-PSDrive C`.

## Final report

- Issues closed (number, title, evidence link).
- Shipped but not verified: the ACs and the reason.
- Parked for a big decision: one question each.
- Prod test data created (what, where, and that it still needs deleting).
- Branches and PRs left open, worktrees with uncommitted work, and why.
- Open code-scanning alerts on main (number, rule, file), from `gh api "repos/{owner}/{repo}/code-scanning/alerts?state=open"`.
- Free space on C:, and whether disk-hygiene cleanup ran.

## Settled defaults

- One release per batch of 6 to 8 issues, one release in flight at a time.
- Lanes use filtered tests only. The integrator runs a light local check. The full suites and coverage run in CI, not on the laptop.
- Soft deadline: a merged release always finishes its prod check; unmerged work stays as a pushed branch.
- Two lanes, each working a queue, in persistent worktrees.
