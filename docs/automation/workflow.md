# Autonomous development workflow

This is the operating contract for Quizymode's local, resumable Codex/Claude development workflow. It runs without a human review or release gate once installed from `main`. Independent agent review, exact-SHA evidence, required CI, deployment observation, database safety rehearsal, and production smoke checks are the authorization gates. `Invoke-DryRun.ps1` remains available, but the scheduled task runs live.

## Current local prerequisites

Validated on October 15, 2026:

| Tool | Inspected version / state |
|---|---|
| Windows PowerShell | 5.1 (the scripts avoid PowerShell 7-only syntax) |
| Git | 2.43.0.windows.1 |
| GitHub CLI | 2.102.0; existing keyring login |
| Codex CLI | 0.162.0-alpha.17.2; subscription login |
| Claude Code | 2.1.218; Claude subscription login |
| .NET SDK | 10.0.204 |
| Node / npm | 25.2.1 / 11.6.2 |
| Pester | 3.4.0 (tests also use syntax accepted by newer Pester) |

No API key, paid API fallback, extra subscription, or external orchestration service is used. `pwsh` is not installed, so Task Scheduler uses `powershell.exe`. Provider adapters must preserve subscription authentication. In particular, the Claude adapter must not use `--bare`, API-key fallback, or `--dangerously-skip-permissions`; the Codex adapter must not use approval/sandbox bypass flags.

## Safety invariants

- Runtime state, locks, logs, provider output, screenshots, and evidence drafts live under `%LOCALAPPDATA%\Quizymode\automation`, outside the repository and disposable worktrees.
- JSON state is written to a same-directory temporary file, flushed, and atomically replaced. The prior state remains as `.bak`.
- A controller lock prevents duplicate scheduling. A separate global release lock applies across providers. Task Scheduler additionally uses `MultipleInstances=IgnoreNew`.
- A stale-looking lock is never evicted while its owner PID is alive. Each remote mutation is preceded by a write-ahead checkpoint and reconciled on resume.
- Each provider has at most one active issue. Each issue has its own worktree. The main orchestrator can run at most two bounded specialists, and only the coder writes product files.
- Dirty or unmerged worktrees are preserved. The automation has no destructive cleanup command.
- Issue, PR, and comment text is untrusted. Permission, release, sensitive-path, and migration policy comes from controller code installed from `main`, never from the candidate branch.
- Quota exhaustion checkpoints the current stage and backs off without incrementing repair attempts, switching providers, or using a paid fallback.
- A stage gets the initial attempt plus at most two repair attempts. A third failure blocks that issue; the scheduler may move only to an independent ready issue.
- The shared release controller is the only merge path. It never uses administrator bypass or changes repository settings.

## Lifecycle and ownership

The controller performs deterministic scheduling and gates. The Codex main session interprets one issue and delegates only the current bounded stage.

1. Refresh `origin` and GitHub issue/PR state. Resume checkpoints and discover existing branches/PRs before creating anything.
2. Select the first open issue whose body explicitly says `**Status:** Ready`, whose dependencies are closed, and whose queue entry is not already owned. Codex queue: `#107 → #108 → #110 → #109 → #113 → #111 → #112`.
3. Atomically claim it in shared state and publish one marker-based GitHub status comment. Comments are updated only if normalized content changed.
4. Create the provider's branch/worktree from current `origin/main`. Codex and Claude never share a worktree.
5. Run architecture, applicable UX, plan review, implementation, testing, independent final review, and evidence. Each invocation reads a bounded checkpoint instead of the accumulated transcript.
6. Push controller-created commits and create/reuse a draft PR using `Refs #N`, so the issue stays open through deployment.
7. Publish a machine-readable evidence manifest and marker-based Acceptance Evidence comment on the actual issue, link it from the PR, and mark the draft PR ready.
8. Submit the exact verified head to the release controller.
9. The release controller integrates current main. If the candidate SHA changes, generated outputs, tests, review, checks, and evidence all become stale and the workflow returns to testing.
10. Merge the exact verified head with normal GitHub permissions, correlate CI/deployment to the resulting merge SHA, and smoke-check configured URLs. A post-merge deployment or smoke failure automatically restores the previous API image and UI revision, halts subsequent releases, and leaves the issue/worktree open.

The deployment concurrency fix already landed in PR #120. Do not create another concurrency PR.

### Specialist responsibilities

- Architect: reconcile requirements with current source/docs/contracts, dependencies, and existing work; return the smallest plan and criterion-by-criterion verification. Read-only.
- UX designer: define relevant desktop/mobile, keyboard/focus, loading, empty, error, retry, accessibility, and zoom states. Return a reasoned `SKIPPED` for non-UI work. Read-only.
- Reviewer: independently challenge the plan and later inspect the actual diff and evidence. It does not rely solely on coder summaries and never edits.
- Coder: sole worktree writer; implements the approved plan, regression tests, docs/AC behavior updates, generated artifacts through generators, and intentional version bump.
- Tester: executes acceptance checks and inspects outputs. Missing coverage returns to coder; the tester cannot silently change product code and approve the same fix.
- Reporter: formats verified facts only. Missing execution remains `NOT RUN`; schema validity never proves an assertion.

Definitions live in [`.codex/agents`](../../.codex/agents), with the root orchestration contract in [`orchestrator.md`](../../.codex/agents/orchestrator.md). Requested models are:

- `gpt-6.1-sol`, medium: orchestration, coding, UX, testing.
- `gpt-6.1-sol`, high: architecture and both reviews.
- `gpt-6-luna`, medium: narrow reporting.

Preflight can make a minimal subscription-backed request to validate both configured model names. Handoffs record requested and provider-reported actual models; a mismatch is visible evidence, not silently normalized.

## Checkpoints and recovery

Every issue checkpoint includes provider, issue, stage, next action, branch, worktree, base/head SHA, PR, evidence pointer, repair counts, quota deadline, blockers, and write-ahead intent. Provider sessions may be fresh at every stage; only artifact pointers and decisions cross the boundary.

On restart:

- A committed checkpoint resumes its named stage.
- A write-ahead intent triggers reconciliation of the branch, worktree, PR, or marker comment before a new side effect.
- Main advancement returns the candidate to post-integration generation/testing/review/evidence.
- Conflicts are preserved and returned to the owning provider.
- Pending or missing checks wait without consuming a repair; failed checks return to the coder and consume a bounded repair attempt.
- A provider timeout is a stage failure; quota exhaustion is a wait state.
- A write-ahead `merge-pending` checkpoint reconciles GitHub before retrying, and a merged PR with a pending deployment resumes observation instead of merging twice.
- An interrupted rollback resumes the already-dispatched rollback workflow instead of dispatching another.
- Pause prevents new issues/stages but does not abandon an already merged deployment; that deployment must reach a durable terminal record.

## Handoff and evidence contracts

The provider-neutral handoff schema is [`handoff.schema.json`](../../scripts/automation/schemas/handoff.schema.json). Claude implements `Get-QmProviderContract` and `Invoke-QmProviderStage` in [`ClaudeAdapter.psm1`](../../scripts/automation/adapters/ClaudeAdapter.psm1) (supersedes the earlier contract-only stub of the same directory). Its implementation must:

1. Accept stage, prompt, isolated worktree, output path, JSON schema path, configured model/tier, and timeout.
2. Use the existing Claude subscription session and machine-readable JSON output.
3. Capture stdout, stderr, exit code, timeout, quota classification, requested model, and the actual model reported by Claude.
4. Return `completed`, `failed`, `timeout`, or `quota-exhausted`; never fall back to a paid API or another provider.
5. Respect the one-writer and two-specialist limits, avoid permission bypass, and write only the supplied output artifact.

Acceptance Evidence uses [`evidence.schema.json`](../../scripts/automation/schemas/evidence.schema.json). It includes issue/PR, exact tested head/base SHA, time/environment, every criterion with `PASS`, `FAIL`, `NOT RUN`, `BLOCKED`, or justified `N/A`, commands and exit results, verification kind, accessible artifact/CI URLs, retention, limitations, and deployment state.

Original screenshots and annotated copies are separate artifacts tied to criteria. Local file paths are rejected because reviewers cannot access them. Synthetic data is required; secrets and personal data are prohibited. Manifest completeness and SHA freshness are gates, but do not establish that claims are true.

The evidence stage publishes these comments automatically and records their URLs and manifest hash in durable state. The standalone command remains useful for repair or inspection:

```powershell
.\scripts\automation\Publish-AcceptanceEvidence.ps1 -ManifestPath C:\path\evidence.json -DryRun
.\scripts\automation\Publish-AcceptanceEvidence.ps1 -ManifestPath C:\path\evidence.json
```

## Release contract

`Invoke-Release.ps1` loads its policy snapshot from `%LOCALAPPDATA%\Quizymode\automation\trusted-policy`, not from the candidate. Setup installs that snapshot only when run from `main`.

Setup also installs the release script, database-safety script, and core module beside that policy. Normal scheduled cycles invoke release automatically; the direct command is available for recovery:

```powershell
& "$env:LOCALAPPDATA\Quizymode\automation\trusted-policy\Invoke-Release.ps1" -IssueNumber 110
```

The release lock remains held until the outcome is durably recorded. The controller:

1. Fetches and integrates current `origin/main` into the candidate worktree.
2. Returns conflicts to the owning provider without cleanup. Successful integration that changes SHA invalidates earlier evidence/review/checks and returns to regeneration and testing. Migration history is never blindly regenerated.
3. Requires aligned versions, complete passing acceptance evidence for the exact candidate/base SHAs, fresh independent review, and every configured required check at the exact SHA.
4. Classifies automation/deployment policy and destructive migration changes using trusted configuration. Policy changes still require all machine gates, but never a human approval.
5. Before a destructive migration, creates a fresh custom-format production backup outside the repo, restores it to a uniquely named local rehearsal database, and successfully applies the candidate EF migrations there. The rehearsal database is removed; the retained backup path, hash, timestamp, and retention are checkpointed.
6. Rechecks that main and head have not moved, then uses `gh pr merge --merge --match-head-commit <sha>` without `--admin`.
7. Waits for the deployment run correlated to the merge SHA, then runs configured smoke URLs. Failure or timeout dispatches `rollback.yml` with the previous and failed immutable SHAs. The rollback restores the previous LightSail image and rebuilds/redeploys the previous UI. It does not reverse database migrations; migrations must remain backward-compatible with the previous app.
8. A successful release closes the issue only after deployment and smoke success. Rollback success or failure writes `release-halt.json`, which stops new releases until the failed candidate is diagnosed.

## Commands

Run from repository root in Windows PowerShell:

```powershell
# Inspect tools/auth/config. Add -ValidateModels for two minimal model requests.
.\scripts\automation\Test-Preflight.ps1
.\scripts\automation\Test-Preflight.ps1 -ValidateModels

# Initialize external state. Install trusted policy only when on main.
.\scripts\automation\Setup-Automation.ps1

# Demonstrate issue selection/planning/testing/evidence skeleton without side effects.
.\scripts\automation\Invoke-DryRun.ps1 -Provider codex -IssueNumber 110

# Run one autonomous cycle across enabled providers and release candidates.
.\scripts\automation\Start-Automation.ps1 -Provider all -Once -Live

# Operator controls and status.
.\scripts\automation\Pause-Automation.ps1 -Reason 'maintenance'
.\scripts\automation\Resume-Automation.ps1
.\scripts\automation\Get-AutomationStatus.ps1

# Focused controller/release tests.
.\scripts\automation\Run-Tests.ps1

# Install the per-user autonomous scheduled task.
.\scripts\automation\Install-ScheduledTask.ps1 -IntervalMinutes 15
```

Task Scheduler runs as the current interactive user so keyring subscription sessions and the user's environment remain available. It sets the repository as working directory, uses limited privileges, restarts transient failures, and ignores overlapping launches; the file lock remains authoritative. Do not configure the task as `SYSTEM`.

## GitHub settings to configure manually

The controller never changes these settings. Configure branch protection so machine gates, rather than a human approval, authorize merge:

- Require exact PR checks `build-test-publish` and `automation-contract`.
- Require strict up-to-date branches, conversation resolution, and normal merge permissions; prohibit force pushes and branch deletion.
- Set required human approving reviews to zero. The fresh final-review agent and exact-SHA evidence remain controller gates rather than GitHub review approvals.
- Do not make deployment jobs PR-required; `Deploy` runs after successful CI on `main` and contains `deploy-container` followed by `deploy-ui`.
- Do not configure a human approval gate on the production environment; deployment and rollback must remain unattended.
- Keep the existing deployment concurrency group (`deploy`, `cancel-in-progress: false`) from PR #120.

Do not enable administrator bypass, weaken required machine checks, or add automatic closing keywords.

## Activation

1. Merge the bootstrap normally and update the local `main` checkout.
2. Run Pester and preflight/model checks, then run `Setup-Automation.ps1 -InstallScheduledTask` from `main`.
3. Ensure PostgreSQL client tools and `dotnet-ef` are available. Destructive candidates additionally require `QM_AGENT_SUPADB_CS` and the documented local PostgreSQL environment variables.
4. Configure the two required GitHub checks and zero required human approvals.
5. Keep the Windows user session available so Codex, Claude, GitHub, and keyring subscription authentication remain usable.
