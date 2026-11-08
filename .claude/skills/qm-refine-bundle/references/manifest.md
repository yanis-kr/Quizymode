# Bundle manifest reference (schemaVersion 1)

`bundle.mjs check` enforces the rules marked (enforced). The template is `../templates/manifest.template.json`.

| Field | Meaning |
|---|---|
| `bundleId` | Folder name, `^[a-z0-9][a-z0-9-]{2,47}$`, e.g. `b-20261108-guest`. (enforced) |
| `repo.nameWithOwner` | Must match `origin`; checked by `verify`. (enforced) |
| `source.commit` | `origin/main` SHA the plan was made against. `verify` diffs it against the current `origin/main` and reports files that overlap each issue's `scope.paths`. (enforced) |
| `releaseMode` | `auto-merge-deploy` (merge release PR when gates pass; the Deploy workflow then ships prod) or `release-pr-only` (stop at a green PR). Must agree with `authorization.mergeToMain`. (enforced) |
| `branches` | `release/<id>` and `bundle/<id>/` prefix. Only the release branch is pushed. |
| `versionBump` | `patch`, `minor`, or `major`; applied once on the release branch. (enforced) |
| `issues[]` | `number`, `title`, unique `order`, `snapshot` (`state`, `updatedAt`, `bodySha256` from `bundle.mjs snapshot`), `risk`, `ux`, `migration`, `dependsOn` (bundle issue numbers or `{"external": "..."}`; no cycles), `scope.summary`, `scope.paths` (globs; a bare path also matches everything below it; an empty list means every change on main counts as overlap), `scope.exclusions`, `acceptanceCriteria[]` (`id`, `text`, `evidence`), `validation[]`. Number, order, snapshot, risk (`low`/`medium`/`high`), boolean `ux`/`migration`, arrays, dependencies, and at least one AC are enforced; the text of `summary`, `exclusions` and `validation` is not. |
| `excluded[]` | Issues considered and left out, with a reason. Never worked on. |
| `policies.blockedIssue` | `defer-and-continue` or `stop-bundle`. (enforced) |
| `policies.partialRelease` | `ship-completed-independent` (release what is done and does not depend on deferred work) or `all-or-nothing`. (enforced) |
| `policies.sourceDrift` | `proceed-unless-overlap` (overlapping issues go to the decision agent) or `stop-on-any`. (enforced) |
| `authorization.mergeToMain` | Merging deploys production (CI on main, then Deploy via `workflow_run`). (enforced) |
| `authorization.migrations` | `none`, `additive-only`, `any-reviewed`. An issue with `migration: true` needs more than `none`. (enforced) |
| `authorization.infraChanges` | `none`, or `listed` with `infraAllowed[]`. (enforced) |
| `authorization.prodDataWrites` | `none` or `test-data-only` (record what was created). (enforced) |
| `authorization.prodReadQueries` | Read-only SQL in a READ ONLY transaction. |
| `authorization.rollback` | `rollback-workflow` (dispatch `Rollback` with `previous_sha`/`failed_sha` on the trigger) or `report-only`. (enforced) |
| `authorization.closeIssues` | Close each issue after its Acceptance Evidence comment is posted. |
| `authorization.paidServices` | Must be `false`. (enforced) |
| `limits` | `maxAttemptsPerIssue`, `maxCiRuns` (pushes to the release PR), `maxWallClockHours`, `lockStaleMinutes`. (enforced) |
| `releaseGates[]` | Checks that must all pass before merge. Non-empty. (enforced) |
| `postDeploy` | `checks[]` after merge and `rollbackTrigger`. |

## Approval

`approval.json` stores `manifestSha256` (SHA-256 of the exact bytes of `manifest.json`), the user's verbatim reply, and the history of superseded approvals. Any edit to the manifest after approval makes `verify` reject it. The approval is a record written by Claude after the user's message; it is not a cryptographic signature.

## State

`state.json` is separate and mutable. `state-init` creates it (exclusively) and prints a `holder` token; every executor command must pass it back with `--holder`. `checkpoint` re-checks the manifest hash and approval, the lock, and the wall clock (reset on each resume, not enforced after merge so verification and rollback always finish). `merge-gate` must pass before `gh pr merge`. Fields: `phase`, per-issue `status`/`attempts`/`branch`/`commit`/`notes`, `release` (`prNumber`, `previousMainSha`, `mergeSha`, `deployRunId`), `blockers[]`, `decisions[]`, `ciRuns`, `lock`, `log[]`. Only `bundle.mjs` writes it, so status names stay valid and issues outside the manifest are rejected.
