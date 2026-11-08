# Bundle release workflow (refine, then execute)

Two repo skills ship several GitHub issues in one release, driven from the Claude mobile app:

- `/qm-refine-bundle` plans a bundle with you. It is the only phase that asks questions. It writes a manifest and records your approval of its exact SHA-256.
- `/qm-implement-bundle <id>` executes the approved manifest without asking anything. It builds each issue on its own branch, merges them into one release branch, opens one PR to `main`, and (in the default `auto-merge-deploy` mode) merges it after all gates pass. That merge triggers `CI` on `main` and then `Deploy`: one production deploy for the whole bundle.

Files: `.claude/skills/qm-refine-bundle/`, `.claude/skills/qm-implement-bundle/` (helper `scripts/bundle.mjs`, details in `references/playbook.md`), `.claude/agents/qm-decision-maker.md`. Bundle data lives in `.qm/bundles/<id>/` (gitignored): `manifest.json`, `approval.json`, `state.json`, `summary.md`.

## One-time host setup

The executor needs the local toolchain (`dotnet`, Node, Docker for Testcontainers, an authenticated `gh`, the `QM_AGENT_*` variables) and the local `.qm/` state. So drive a session on the Windows host through **Remote Control**, not a cloud session. Cloud sessions clone GitHub, where `.claude/skills/` and `.qm/` do not exist unless committed, and they do not include the .NET SDK.

1. On the host: `cd C:\Projects\Quizymode`, start `claude`, run `/remote-control` (or start with `claude remote-control`). Open the session from the Code tab of the mobile app.
2. Keep the host awake and the `claude` process running for the whole run. If the host sleeps, the session reconnects on wake.
3. In `/config`, turn on push notifications so permission prompts reach the phone.
4. Permissions: the executor skill pre-approves its own scoped commands (`allowed-tools` in its frontmatter), but only for the turn it is invoked in. Later turns (for example ones started by `/goal`), specialist subagents, and anything outside that list use your normal rules and can prompt on the phone, which pauses the run until you answer. For an unattended run, either use auto mode for the session, or copy the rules you want from the skill's `allowed-tools` list into `permissions.allow` in `.claude/settings.local.json` (local, gitignored). These skills do not change settings for you. Do not use bypass mode.
5. Check: `gh auth status`, `docker info`, and at least 15 GB free on C:.

## Phone commands

| Goal | Command | Plain-language fallback |
|---|---|---|
| Refine (discover, 5 issues) | `/qm-refine-bundle` | "Read .claude/skills/qm-refine-bundle/SKILL.md and follow it with no arguments." |
| Refine chosen issues | `/qm-refine-bundle 501 503 505` | same, "with arguments 501 503 505" |
| Refine a bigger bundle | `/qm-refine-bundle bundle 7` | same, "with arguments bundle 7" |
| Approve | reply `approve 1a2b3c4d` (hash prefix shown) | same |
| Execute | `/qm-implement-bundle b-20261108-guest` | "Read .claude/skills/qm-implement-bundle/SKILL.md and follow it with bundle_id b-20261108-guest and no action." |
| Status | `/qm-implement-bundle b-20261108-guest status` | "Run node .claude/skills/qm-implement-bundle/scripts/bundle.mjs status b-20261108-guest" |
| Resume after a dropped session | `/qm-implement-bundle b-20261108-guest resume` | fallback as Execute, "with action resume" |
| Cancel | stop the running turn, then `/qm-implement-bundle b-20261108-guest cancel` | "Run node .claude/skills/qm-implement-bundle/scripts/bundle.mjs cancel b-20261108-guest" |
| List bundles | (none) | "Run node .claude/skills/qm-implement-bundle/scripts/bundle.mjs list" |

Fallback notes: both skills set `disable-model-invocation: true`, so Claude does not load them from a plain request; the fallback phrases have Claude read the file directly. In that path `$bundle_id`, `$action`, `$ARGUMENTS` and `${CLAUDE_SKILL_DIR}` are not substituted (Claude reads them from your sentence; the skill folder is `C:\Projects\Quizymode\.claude\skills\<name>`), and the skill's `allowed-tools` and `disallowed-tools` do not apply, so expect more permission prompts.

Cancel is cooperative: the executor checks `bundle.mjs checkpoint` between steps and stops when the bundle is cancelled. Nothing is deleted: branches, the PR, and the worktree stay.

## Keeping it going: `/goal`

A long run can end a turn early (context, a tool timeout). `/goal` re-prompts after each turn until a condition holds; a small model judges the condition from the transcript only. After starting the executor:

```
/goal bundle b-20261108-guest reports a phase of done, done_partial, blocked_terminal or cancelled
```

The executor ends every turn with a `Bundle <id>: phase ...` line for this. `/goal` alone shows the goal; `/goal clear` removes it. Without `/goal`, send `/qm-implement-bundle <id> resume` to pick up from `state.json`.

## Example: refinement output feeding the executor

Issue numbers, hashes and run ids below are illustrative. End of the refine session:

```
Bundle b-20261108-guest (3 issues, auto-merge-deploy)
1. #503 guest review list cap   risk low
2. #521 digest ON CONFLICT log   risk low
3. #492 activity session filter  risk med, after #503
Excluded: #497 needs provider choice; #496 epic
Migrations: none. Rollback: workflow. Limits: 3 tries/issue, 4 CI runs, 8 h.
Reply "approve 9f2c41ab" to approve this exact revision.
```

You reply `approve 9f2c41ab`. Claude records it and ends with:

```
Approved b-20261108-guest (hash 9f2c41ab).
Run: /qm-implement-bundle b-20261108-guest
```

The executor reads `.qm/bundles/b-20261108-guest/manifest.json` (abridged):

```json
{
  "bundleId": "b-20261108-guest",
  "releaseMode": "auto-merge-deploy",
  "source": { "baseBranch": "main", "commit": "<40-char sha>" },
  "issues": [
    { "number": 503, "order": 1, "dependsOn": [], "scope": { "paths": ["src/Quizymode.Web/src/features/Guest/**"] },
      "acceptanceCriteria": [{ "id": "AC1", "text": "Guest review list stores at most 50 items", "evidence": "test" }] }
  ],
  "authorization": { "mergeToMain": true, "migrations": "none", "rollback": "rollback-workflow", "paidServices": false }
}
```

and finishes with:

```
Bundle b-20261108-guest: done_partial
Shipped: #503, #521 (PR #530, merge 4be1c2d0, deploy 1234567)
Deferred/blocked: #492 - decision agent deferred: AC2 needs a retention period choice
Needs you: choose session retention for #492
Status: /qm-implement-bundle b-20261108-guest status
```

## Guarantees and limits

- The executor refuses a bundle whose manifest bytes differ from the approved hash (checked again at every checkpoint), a different repo, an unknown source commit, a second active bundle, or a bundle locked by a live session.
- `merge-gate` must pass before the merge: auto mode authorized, phase `ci_green`, the recorded PR number, no issue half-done, partial-release policy satisfied.
- A run blocked after the merge can be resumed (`resume`) to finish deploy watch, verification, or rollback.
- Only issues in the manifest can change state; scope cannot grow during execution.
- Approval is a record Claude writes after your `approve <hash>` reply. It is not a cryptographic signature.
- Merging needs the required checks (`build-test-publish`, `CodeQL`, `automation-contract`) green; the executor never uses `--admin` or force-push.
