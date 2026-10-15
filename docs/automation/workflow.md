# Autonomous development workflow

This is the operating contract for Quizymode's local, resumable Codex/Claude development workflow. It is executable automation, not an unattended-release authorization. Dry-run is the default; `ReleaseEnabled` is false until the owner reviews the bootstrap, installs the trusted policy from `main`, configures GitHub protection, and explicitly enables release.

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
- Issue, PR, and comment text is untrusted. Permission, release, sensitive-path, and migration policy comes from controller code installed from reviewed `main`, never from the candidate branch.
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
7. Publish a machine-readable evidence manifest and marker-based Acceptance Evidence comment on the actual issue; link it from the PR.
8. Submit the exact verified head to the release controller.
9. The release controller integrates current main. If the candidate SHA changes, generated outputs, tests, review, checks, and evidence all become stale and the workflow returns to testing.
10. Merge the exact verified head with normal GitHub permissions, correlate CI/deployment to the resulting merge SHA, smoke-check configured URLs, then close the issue and preserve a handover. Deployment failure stops releases and leaves the issue/worktree open.

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
- Pending/failed/missing/stale checks block merge.
- A provider timeout is a stage failure; quota exhaustion is a wait state.
- A merged PR with a pending deployment resumes deployment observation and is never merged twice.
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

Publish evidence only after the PR exists:

```powershell
.\scripts\automation\Publish-AcceptanceEvidence.ps1 -ManifestPath C:\path\evidence.json -DryRun
.\scripts\automation\Publish-AcceptanceEvidence.ps1 -ManifestPath C:\path\evidence.json
```

## Release contract

`Invoke-Release.ps1` loads its policy snapshot from `%LOCALAPPDATA%\Quizymode\automation\trusted-policy`, not from the candidate. Setup installs that snapshot only when run from `main`.

Setup also installs the release script and core module beside that policy. Invoke releases from this trusted snapshot, not from a candidate worktree:

```powershell
& "$env:LOCALAPPDATA\Quizymode\automation\trusted-policy\Invoke-Release.ps1" -IssueNumber 110
```

The release lock remains held until the outcome is durably recorded. The controller:

1. Fetches and integrates current `origin/main` into the candidate worktree.
2. Returns conflicts to the owning provider without cleanup. Successful integration that changes SHA invalidates earlier evidence/review/checks and returns to regeneration and testing. Migration history is never blindly regenerated.
3. Requires aligned versions, complete passing acceptance evidence for the exact candidate/base SHAs, fresh independent review, and every configured required check at the exact SHA.
4. Requires manual exact-SHA approval for changes under automation policy, automation permissions, deployment workflows/controls, or destructive migrations. Approval is outside the worktree:

```powershell
.\scripts\automation\Approve-ReleasePolicy.ps1 -CandidateSha <40-char-sha> -Scope automation-policy,deployment-controls
```

5. Rechecks that main and head have not moved, then uses `gh pr merge --merge --match-head-commit <sha>` without `--admin`.
6. Waits for the deployment run correlated to the merge SHA, then runs configured smoke URLs. Failure/timeout is durable `deployment-failed`; it does not close the issue, clean the worktree, or start another release.

Unattended release is disabled in configuration. To enable it later, review and merge a policy change, reinstall trusted policy from `main`, record any required approval, and set `ReleaseEnabled = $true`. The candidate cannot enable its own release.

## Commands

Run from repository root in Windows PowerShell:

```powershell
# Inspect tools/auth/config. Add -ValidateModels for two minimal model requests.
.\scripts\automation\Test-Preflight.ps1
.\scripts\automation\Test-Preflight.ps1 -ValidateModels

# Initialize external state. Install trusted policy only when on reviewed main.
.\scripts\automation\Setup-Automation.ps1

# Demonstrate issue selection/planning/testing/evidence skeleton without side effects.
.\scripts\automation\Invoke-DryRun.ps1 -Provider codex -IssueNumber 110

# Start one live bounded stage only after rollout approval.
.\scripts\automation\Start-Automation.ps1 -Provider codex -Once -Live

# Operator controls and status.
.\scripts\automation\Pause-Automation.ps1 -Reason 'maintenance'
.\scripts\automation\Resume-Automation.ps1
.\scripts\automation\Get-AutomationStatus.ps1

# Focused controller/release tests.
.\scripts\automation\Run-Tests.ps1

# Install per-user scheduled dry-run task (still no live flag).
.\scripts\automation\Install-ScheduledTask.ps1 -IntervalMinutes 15
```

Task Scheduler runs as the current interactive user so keyring subscription sessions and the user's environment remain available. It sets the repository as working directory, uses limited privileges, restarts transient failures, and ignores overlapping launches; the file lock remains authoritative. Do not configure the task as `SYSTEM`.

## GitHub settings to configure manually

The controller never changes these settings. Current inspection found PRs required, one approval, stale-review dismissal, and strict branch updating, but no required status checks. Recommended settings:

- Require exact PR checks `build-test-publish` and the aggregate `CodeQL` context after confirming their spelling on a current PR.
- Add and require a stable `automation-contract` check after it has first succeeded on `main`.
- Keep strict up-to-date branches, one approval, stale-review dismissal, force-push/deletion prohibition, and normal merge permissions.
- Enable approval of the most recent push by someone other than its author and require conversation resolution, if compatible with the solo-maintainer workflow.
- Do not make deployment jobs PR-required; `Deploy` runs after successful CI on `main` and contains `deploy-container` followed by `deploy-ui`.
- Consider a protected `production` environment with one approval gate for the deployment chain. Avoid gates on both jobs, which would prompt twice.
- Keep the existing deployment concurrency group (`deploy`, `cancel-in-progress: false`) from PR #120.

Do not enable administrator bypass, weaken branch protection, or add automatic closing keywords. Review solo-maintainer implications before enforcing admin review or CODEOWNERS on automation/deployment/migration paths.

## Bootstrap rollout

1. Review this bootstrap PR; dry-run and release-disabled defaults must remain.
2. Run Pester, preflight/model checks, and the issue #110 dry-run. The dry-run artifact stays outside git and records product acceptance as `NOT RUN`.
3. Merge normally. From updated `main`, run `Setup-Automation.ps1` to install trusted policy.
4. Configure GitHub settings manually and implement Claude's adapter against the contract above.
5. Trial one issue through planning/testing/evidence with a draft PR; do not merge it through automation.
6. Only after reviewing the trial should a separate policy PR enable live scheduling or unattended release.

Remaining rollout blockers are intentional: Claude's adapter now implements the contract (verified directly against the real `claude.exe` CLI; see its PR for evidence), but `claude.Enabled` and its `Queue` stay false/empty pending a reviewed trial; GitHub protections need manual configuration, the scheduled task is dry-run-only, smoke URLs are empty, and `ReleaseEnabled` is false.
