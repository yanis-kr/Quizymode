# Bundle workflow v2 (recreated design)

> The original `design-v2.md` was lost on 2026-11-25. This file rebuilds it from the "Target workflow v2" section of issue #761 and from an audit of the code on `main` (after #850). Where the code and this text disagree, trust the code (`scripts/bundle/*.mjs`) and `docs/AC.md` section 7.19.

## A. Architecture and state machines

The owner refines issues in GitHub and says "start autopilot". One orchestrator session runs:

select -> parallel-safety check -> lanes A and B (rolling queue) -> batch gate on the release branch -> one release PR -> merge -> hand off to a validator subagent.

The orchestrator is free for the next batch as soon as the validator starts. Only one bundle may be between "release PR open" and "validated" at a time (the release slot).

| Role | Does | Where |
| --- | --- | --- |
| Refine (owner + `qm-bundle-refine`) | ACs, verify method, `scope.paths`, `status:ready` | `.claude/skills/qm-bundle-refine/` |
| Selector | checklist, top N, conflict check | `bundle.mjs select`, `scripts/bundle/select.mjs` |
| Lane A / lane B | one issue at a time, lane-safe tests, pull the next issue | `bundle.mjs next --lane`, `scripts/bundle/rolling.mjs` |
| Integrator (orchestrator) | version bump, `docs/AC.md`, OpenAPI once; batch gate | playbook § Integration, `bundle.mjs batch-gate` |
| Release driver | one PR, CI wait, merge pinned to the head sha | `scripts/release/release.mjs`, `prbody.mjs` |
| Validator (subagent) | wait for Deploy and the exact build, run prod ACs, evidence, labels, close | `.claude/agents/validator.md`, `bundle.mjs validation`, `label-failure` |
| qm-lead | answers questions instead of the owner | `.claude/agents/qm-lead.md` |

Issue state machine (`ISSUE_TRANSITIONS` in `scripts/bundle/transitions.mjs`, enforced by `bundle.mjs issue`):

```
pending -> in_progress -> implemented -> [validated] -> integrated
integrated -> released                  (release PR merged)
released -> verified -> closed          (validator: all ACs pass, evidence posted)
released -> validation_failed           (validator: an AC failed)
validation_failed -> closed | parked
any pre-release -> blocked | parked | deferred
```

`validated` ("lane tests passed") is optional. A first environmental failure (`recheck-once`) keeps the issue `released` until the re-check result is recorded.

Batch state machine (`PHASES` in `scripts/bundle/bundle.mjs`):

```
not_started -> preflight -> implementing -> integrating -> release_pr_open -> ci_green -> merged
merged -> deployed -> validating -> verified -> done | done_partial
any -> blocked_terminal | cancelled
```

Design rule: the orchestrator's part ends at `merged`; `deployed` to `done` belong to the validator. Today the validator uses the orchestrator's holder token, and the orchestrator keeps its lock. `state-init` of another bundle skips a bundle past its merge (`pastMerge` in `transitions.mjs`, AC 7.19.41). The playbook still writes a pre-release `validating` during integration, so `validating` counts as past the merge only once `release.mergeSha` is recorded.

## B. Selection

1. Checklist filter: label `status:ready`, and none of `status:deferred`, `status:needs-refinement`, `status:blocked`, any `bundle:*`, `parked` or `validation-failed` (unless `fix-forward`). The envelope limits apply (`maxIssues`, `maxSize`, `excludeAreas` from `.qm/envelope.json`). An issue in a non-terminal bundle's `state.json` is excluded even if its label was lost.
2. Rank: `fix-forward` first, then priority (`high` > `med` > `low`), then size (smaller first), then the oldest issue number. Take the top `maxIssues` (default 8).
3. Conflict rule (pairwise): overlapping `scope.paths` prefixes, both add a migration, or a `dependsOn` link. Integrator-only files (AC.md, OpenAPI, version files) are ignored. A conflicting pair stays in the batch and shares a lane, in order. When one lane group holds more than half the batch, `select` warns that the lowest-ranked member should be swapped.
4. Unknown scope (no `scope.paths`): paths come from the issue's `area:*` labels through `areaPaths` in `.claude/delivery-profile.json`. With neither, the issue gets its own serial slot at the end of lane B, and a base move reports it as a warning, never as drift.
5. The checklist is printed once and the run proceeds: "start autopilot" is the approval.

## C. Lanes

- Persistent worktrees: lane A, lane B and a release worktree, named in the delivery profile (`worktrees`). `bundle.mjs worktrees --ensure <id>` creates the missing ones and the `node_modules` junctions.
- `bundle.mjs lanes <id>` (read-only) groups issues that must share a lane (dependsOn, migrations, overlapping paths) and sends each group to the lighter lane. Unknown-scope groups go after lane B's other issues (`serialTail`), and `next` holds each one until lane A has no pending or in-progress issue, so it runs alone.
- Rolling queue (`rolling.mjs`, AC 7.19.34): after each issue a lane asks `bundle.mjs next <id> --lane a|b`. It returns the lane's in-progress issue first, then the first pending issue whose in-bundle dependencies are usable. A dependent of an unintegrated branch is stacked on it; a dependent of a failed or parked issue is skipped with the reason.
- One `dotnet` build or test at a time across lanes: `bundle.mjs mutex dotnet --acquire|--release`.
- Lanes never edit the version files, `docs/AC.md` or the OpenAPI artifact; they write AC fragments for the integrator.

## D. Release and validator

1. Batch gate (`bundle.mjs batch-gate`, AC 7.19.44) on the release head, in a clean release worktree at that head: version bump over `origin/main` per `versionBump` (or larger) with the `package.json` mirror equal, `ac-gate --issues` over every integrated issue, each integrated branch merged into the release branch, and no closing keyword in an open PR body. Full suites run in CI (`release-ready`), not here.
2. Release slot free? (no other bundle in `release_pr_open`, `ci_green`, `merged`, `deployed` or `validating`). If not, wait; coding is not blocked.
3. Push `release/<id>`; open one PR with `prbody.mjs` (`Refs #n` only). `phase release_pr_open` needs the slot and a passing gate on the current head.
4. `wait-pr`, `record-review`, `merge-gate` (checks the gate against the PR head and re-reads the PR body), then `release.mjs ship --pr <n> --issues <...>`, which merges with `--match-head-commit`.
5. Record `merged --merge-sha`, issues `released`, then spawn the validator (Opus, fresh context) with a validation packet.
6. Validator: wait for the Deploy and the exact build (`wait-for-production-ready.js --expected-build-version "<QuizymodeVersion>+sha.<7>"`), check each AC by its method (`unit` cites the green CI run, `api` curl, `sql` read-only query, UI screenshot; signed-in only when the owner is signed in), post one evidence comment per issue, record it with `bundle.mjs validation`, apply labels with `bundle.mjs label-failure`, close the issues that pass, then phase `verified` and `done` or `done_partial`.

## E. Failed production validation

| Kind | Outcome (`validationOutcome`) | Labels (`failureLabelPlan`) |
| --- | --- | --- |
| `environmental` | `recheck-once`, then `needs-attention` after the re-check | + `validation-failed`, `needs-attention` |
| `defect`, fix cycle 0 | `fix-forward` | + `validation-failed`, `status:ready`, `fix-forward`; - `bundle:<id>` |
| `defect`, fix cycle 1 or more | `park` | + `validation-failed`, `parked`, `needs-attention`, `owner:human` |
| `ac-wrong` | `needs-refinement` | + `status:needs-refinement` |
| `product` | `park` | as `park` above |
| `rolled-back` | `fix-forward` (keeps the budget) | as `fix-forward` above |

Every outcome other than `fix-forward` and `recheck-once` also removes `status:ready`, `fix-forward` and `bundle:<id>`. A pass removes `fix-forward` and `validation-failed` and keeps `bundle:<id>` as history.

- Same issue, never a clone. The issue stays open until its evidence passes.
- Retry budget: one automatic fix cycle per issue. The counter lives in a hidden `<!-- qm-fix-cycle:n -->` marker in the failure comment, so it survives across bundles; `validation` reads the highest marker when `--fix-cycle` is omitted (AC 7.19.43).
- Only the owner puts `status:ready` back on a parked issue.
- Two or more `defect` failures in one batch write `.qm/autopilot-halt.json`; `state-init` and `select` refuse until the owner removes it (AC 7.19.35).
- Other issues that passed close normally; the batch ends `done_partial`.
- Rollback only for prod-wide breakage and only with `rollback: rollback-workflow`; the validator reports it, it does not run `rollback.yml` itself.

Next batch while a prior batch validates: it may select, claim, code in lanes, merge into its own `release/<id2>` and run the batch gate. It may not open or merge a release PR until the prior batch is terminal or past `validating`; then it merges `origin/main`, runs the batch gate again and continues.

## F. Status (after #850)

| Design element | Status | Where |
| --- | --- | --- |
| Issue transition table | BUILT | `transitions.mjs` `ISSUE_TRANSITIONS`, `bundle.mjs issue` |
| Release slot | BUILT | `transitions.mjs` `releaseSlotHolder`; `phase release_pr_open`, `merge-gate` |
| Validator handoff (next bundle may start, wall clock spares the validator) | BUILT | `transitions.mjs` `pastMerge`; `state-init`, `checkpoint` |
| Validator with its own holder token | PARTIAL | the validator reuses the orchestrator's token (`validator.md`) |
| Selection checklist, rank, exclusions | BUILT | `select.mjs`, `bundle.mjs select` (`checklist`) |
| Envelope limits in selection | BUILT | `bundle.mjs select` reads `.qm/envelope.json` |
| `fix-forward` ranked first | BUILT | `select.mjs` `rankKey` |
| Conflict rule: paths, migrations, dependsOn | BUILT | `select.mjs` `pairConflicts`, `bundle.mjs` `planLanes` |
| Conflict rule: same vertical slice, `hotFiles` pairs | PARTIAL | covered only by path-prefix overlap; `hotFiles` is not read |
| Group over half the batch: swap lowest member | PARTIAL | warning only, no automatic swap |
| Unknown scope: area map, serial slot at the end of lane B | BUILT | `scope.mjs`, `select.mjs`, `planLanes`, `laneQueue` |
| Selection hash in `approval.json` | MISSING | not recorded |
| Rolling lanes, worktrees, mutex | BUILT | `rolling.mjs`, `worktrees.mjs`, `mutex.mjs` |
| Batch gate on the release branch | BUILT | `batch-gate.mjs`, `bundle.mjs batch-gate` |
| Validator agent and `validation` record | BUILT | `validator.md`, `bundle.mjs validation` |
| Failure labels applied by a command | BUILT | `failure-labels.mjs`, `bundle.mjs label-failure` |
| Fix cycle from the hidden marker | BUILT | `failure-labels.mjs` `fixCycleFrom` |
| Halt after two defects | BUILT | `halt.mjs` |
| Autopilot step 1 calls `select` | BUILT | `.claude/skills/qm-bundle-autopilot/SKILL.md` |
| Start hook continues the autopilot run | BUILT | `start-hook.mjs` `approvedMessage` |
| Phase transition table with validator-only writes after `merged`, and `release.liveBuildVersion` | MISSING (deferred) | `bundle.mjs phase` accepts any phase; no live build version is stored |

## G. Open questions (each has the default the design uses)

1. Fix-forward budget per issue: default 1 automatic cycle, then park. Answer 0 parks on the first failure.
2. Rollback trigger: default only for prod-wide breakage (health, an unrelated smoke AC, data integrity). Alternative: roll back on any `defect`.
3. Signed-in prod UI ACs during unattended validation: default `BLOCKED` with the owner action, unless the owner already signed in. Alternative: close on API and SQL evidence.
4. Next batch waiting for the release slot: default code and gate, then wait (no PR). Alternative: do not start until validation ends.
5. Show the checklist and pause, or print and proceed: default print and proceed.
6. Unknown-scope issues: default allowed, in a serial slot at the end of lane B. Alternative: exclude until refine adds `scope.paths`.
