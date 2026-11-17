# Lead brief

The owner's standing preferences for unattended bundle runs. The `qm-lead` agent (`.claude/agents/qm-lead.md`) reads this file before it decides a question that would otherwise go to the owner. Each entry gives the preference and its reason. Decisions the owner makes or corrects during a run are stored as precedents in `.qm/lead/precedents.jsonl` (local, not committed) with `bundle.mjs precedent add`. A precedent with a narrower scope beats this brief for that issue or area only.

## Release and merge

- **Release mode is `auto-merge-deploy`.** Merge to main after every gate passes, which deploys prod. Reason: the owner wants finished work on prod without a second approval per release.
- **One release per batch of 6 to 8 issues, one release in flight at a time.** Reason: a release costs a full CI run and deploy; batching keeps that cost down.
- **Merging a green release PR is allowed.** Reason: the owner approved merges of green PRs. The merge gate (`bundle.mjs merge-gate`) still applies.
- **A merged release always finishes its prod check.** Reason: an unverified deploy is worse than a late stop.

## Blocked and parked work

- **A blocked issue is deferred while independent work continues.** Reason: one stuck issue should not stop the batch.
- **A question the lead cannot settle parks that issue, and the run continues.** Reason: the owner answers parked items once, at the end of the run.
- **The fourth flagged decision on one issue parks it as `needs-refinement`.** Reason: repeated guesses on one issue mean the issue is under-specified.

## Data and infrastructure

- **Prod data writes are test data only, and only rows the run created and recorded.** Reason: real user data must never be touched by an agent.
- **Migrations are additive only in a standing run.** Reason: additive changes can be rolled back by the rollback workflow; destructive ones cannot.
- **No infra changes in a standing run.** Reason: infra changes affect the whole service and need the owner.
- **Read-only prod queries are allowed.** Reason: they let the run verify behavior without changing anything.
- **Seed sync is not applied by a run.** Reason: it writes shared content; the owner confirms it.

## Cost and scope

- **No paid services, new providers or new credentials.** Reason: they cost money or create accounts; the owner decides these himself.
- **Standing runs take at most 8 issues, each size `m` or smaller, and skip `area:auth` and `area:infra`.** Reason: this is the standing envelope (`.qm/envelope.json`, approved once by the owner).
- **Rollback is the Rollback workflow on a failed post-deploy check.** Reason: it is the tested path back.

## Versioning and docs

- **Every user-visible feature is a MINOR version bump; fixes and polish are PATCH.** Reason: `CLAUDE.md` rule; the version is a rule, not a judgment.
- **`docs/AC.md` is updated in the same change as any behavior change.** Reason: `docs/AC.md` is the source of truth for behavior (`CLAUDE.md`).
- **Acceptance criteria are never weakened.** Reason: an AC that is easier to pass is not a passed AC. A weakening decision is always `park`.

## Never without the owner

- Deleting real prod data; account, role or billing changes; messages outside issue and PR comments; real passwords or CAPTCHAs; `--admin`, `--no-verify`, force-push or destructive git on the owner's work; a change to the auth or security model; a destructive migration; dismissing a code-scanning alert as a false positive; legal or policy wording.

## Go-ahead questions are not decisions

"Start the next issue", "commit", "open the PR", "merge when the gates pass", "file a follow-up issue" and "remove a worktree the run created" are yes inside an approved bundle. They are never asked.
