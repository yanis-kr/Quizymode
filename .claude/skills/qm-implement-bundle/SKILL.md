---
name: qm-implement-bundle
description: Execute an approved Quizymode release bundle (from qm-refine-bundle) end to end without asking questions, or show its status, resume it, or cancel it. Only runs when the user invokes it with an explicit bundle id.
argument-hint: "<bundle-id> [status|resume|cancel]"
arguments: [bundle_id, action]
disable-model-invocation: true
disallowed-tools:
  - AskUserQuestion
  - Bash(node *bundle.mjs approve *)
  - Bash(node *bundle.mjs new *)
allowed-tools:
  - Bash(node *bundle.mjs *)
  - Bash(git -C C:/Projects/Quizymode-wt-bundle-* *)
  - Bash(git fetch *)
  - Bash(git branch *)
  - Bash(git worktree remove *)
  - Bash(node scripts/wait-for-production-ready.js *)
  - PowerShell(.\scripts\verify-openapi.ps1 *)
  - Bash(git status *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git rev-parse *)
  - Bash(git ls-remote *)
  - Bash(git worktree add *)
  - Bash(git switch *)
  - Bash(git merge *)
  - Bash(git add *)
  - Bash(git commit *)
  - Bash(git push -u origin release/*)
  - Bash(git push origin release/*)
  - Bash(gh issue view *)
  - Bash(gh issue comment *)
  - Bash(gh issue close *)
  - Bash(gh issue create *)
  - Bash(gh pr list *)
  - Bash(gh pr view *)
  - Bash(gh pr create *)
  - Bash(gh pr checks *)
  - Bash(gh pr merge *)
  - Bash(gh run list *)
  - Bash(gh run view *)
  - Bash(gh run watch *)
  - Bash(gh workflow run rollback.yml *)
  - Bash(dotnet build *)
  - Bash(dotnet test *)
  - Bash(npm ci)
  - Bash(npm test *)
  - Bash(npm run *)
---

# Implement an approved bundle

Bundle id: `$bundle_id`. Action: `$action` (empty means execute).

`BUNDLE` below means `node "${CLAUDE_SKILL_DIR}/scripts/bundle.mjs"` (Bash tool, any directory of this repo; quote the path and write it with forward slashes, because Git Bash drops unquoted backslashes). It prints JSON (except `status`, which prints text) and exits non-zero on rejection: 1 usage, 2 rejected, 3 limit reached, 4 lock held. `state-init` prints a `holder` token: pass `--holder <token>` to every later `BUNDLE` call in this run, or it is refused (when Claude Code exposes a session id the token is that id, so it stays the same across turns; if you lose it, run `state-init` again). Never run `BUNDLE approve` or `BUNDLE new` here; approval only happens in the refine session.

## Actions

- `status`: run `BUNDLE status $bundle_id`, reply with its output, stop.
- `cancel`: run `BUNDLE cancel $bundle_id --note "cancelled by user"`, reply in one line, stop. Do not delete branches or PRs.
- `resume`: same as execute, but pass `--take-over` to `state-init` (the user is telling you the earlier session is gone).
- empty: execute.

If `$bundle_id` is empty or the bundle folder does not exist, reply with `BUNDLE list` output and stop. Never pick a different bundle yourself.

## Execution contract

The user approved a manifest; that approval is the only authority for this run. Because the user is not watching and the refine phase already answered every product question:

- Do not ask the user anything. No questions, no "continue?", no "shall I commit/merge?", no AskUserQuestion. Progress updates are statements.
- Do only what the manifest lists. Never add an issue, widen a scope, weaken an acceptance criterion, skip a release gate, use `--admin`/`--no-verify`/force-push, or run a production operation the `authorization` block does not grant. `BUNDLE issue` rejects issue numbers outside the manifest.
- Material ambiguity (two reasonable readings that change behavior or ACs): ask the `qm-decision-maker` subagent, giving it the absolute manifest path and the relevant issue text and diff. Save its JSON reply verbatim to a scratch file, record it with `BUNDLE decision $bundle_id --file <f> --issue <n>`, and follow the `outcome` the script prints. On `defer` the script marks the issue deferred; do not guess instead. Never write a decision file yourself.
- Blockers: record facts with `BUNDLE blocker` (kinds: environmental, dependency, check-failed, product-deferred, source-drift, limit) and continue with independent issues if `policies.blockedIssue` is `defer-and-continue`. Missing permissions, credentials, unavailable services, rate or usage limits are `environmental` blockers. Report them as blockers, never as done.
- Run `BUNDLE checkpoint $bundle_id` before each issue and before each release step. Exit 2/3/4 means stop: write the terminal status (below) and end.
- Bounded effort: `BUNDLE attempt` before each try on an issue, `BUNDLE ci-run` before each push to the release PR. Exit 3 means stop retrying that item.

## Steps

Full detail, commands, and the reconcile table are in [references/playbook.md](references/playbook.md). Read it before step 1.

1. **Verify.** `git fetch origin main`, then `BUNDLE state-init $bundle_id` (add `--take-over` for `resume`). It checks the manifest hash against the approval, repo identity, source commit, the lock, and one-bundle-at-a-time, and it reports source drift. Then `BUNDLE verify $bundle_id --gh` for issue changes since refinement. Rejection: report the reason in two lines and stop.
2. **Reconcile** existing progress with Git and GitHub (playbook § Reconcile) so nothing is redone or duplicated.
3. **Handle drift** per `policies.sourceDrift` and closed or edited issues (playbook § Drift).
4. **Prepare** the release worktree and branch (playbook § Branches). Never work in the user's main checkout.
5. **Per issue, in `order`**, skipping ones already `integrated` or later: check dependencies, branch, plan, implement, validate every AC with real evidence, merge into the release branch (playbook § Per-issue loop).
6. **Integrate**: one version bump, AC.md and OpenAPI consistency, all `releaseGates` on the combined branch, one reviewer final pass on the combined diff (playbook § Integration).
7. **Release** per `releaseMode`: one PR from the release branch, green required checks, then for `auto-merge-deploy` run `BUNDLE merge-gate $bundle_id --pr <n>` and merge only on exit 0, watch CI on main and Deploy, verify prod, publish evidence, close issues, roll back on the trigger (playbook § Release).
8. **Finish**: set phase `done`, `done_partial`, or `blocked_terminal`, then reply with the final report.

## Final report (phone-sized)

```
Bundle <id>: <phase>
Shipped: #a, #b (PR #p, merge <sha8>, deploy <run>)
Deferred/blocked: #c - <one-line factual reason>
Needs you: <only environmental blockers or deferred decisions, one line each>
Status: /qm-implement-bundle <id> status
```

End every turn of this run with one status line (`Bundle <id>: phase <phase>, <k>/<n> integrated`) so a `/goal` evaluator can see progress.
