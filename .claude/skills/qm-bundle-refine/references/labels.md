# Issue label taxonomy

Used by `qm-bundle-refine` to decide which labels to set on bundled and excluded issues. Format: `<dimension>:<value>`, lowercase, one `:`, no spaces, kebab-case values.

## Dimensions

| Dimension | Values | Cardinality | Mandatory |
|---|---|---|---|
| `type:` | implementation, bug, validation, configuration, decision, content, chore, epic | exactly 1 | every open issue |
| `owner:` | agent, human | exactly 1 | every open issue |
| `status:` | ready, needs-refinement, blocked, deferred | exactly 1 | every open issue (default `needs-refinement`) |
| `size:` | xs, s, m, l | exactly 1 | ready issues (recommended on all) |
| `priority:` | high, med, low | exactly 1 | ready issues |
| `area:` | see below | 1 to 3 | ready issues |
| `refiner-model:` | opus (default), or the model that refined the issue | 0 or 1 | only when it differs from the default |
| `executor-model:` | haiku (default), or the highest tier that contributed, taken from the issue's `scripts/automation/usage-ledger.mjs` ledger line (`.qm/ledger/issues.jsonl`) | 0 or 1 | only when it differs from the default |
| `resolution:` | superseded, duplicate, wontfix, invalid | 0 or 1 | closed issues only |

Dependabot labels (`dependencies`, `javascript`, `github_actions`, `.NET`) are for PRs only and exempt.

## Defaults

The defaults table is canonical in the root [README.md](../../../../README.md#issue-labels). Refine must apply those defaults and must not add `status:ready` as a default. `executor-model:` and `refiner-model:` are attribution, recorded when the work is done.

## Consistency rules

- `status:ready` requires `owner:agent`, `size:xs|s|m`, a `priority:*`, at least one `area:*`, and a body with draft ACs and verify methods (or "No behavior change"). This is the autopilot's "ap-ready: yes".
- `size:l` never carries `status:ready`. It must be split first.
- `type:decision` means `owner:human`.
- `owner:human` means status is `blocked`, `deferred` or `needs-refinement`.
- `type:epic` is never a work item. Its sub-issues carry their own labels.
- Multi-area uses several `area:*` labels, never combined labels. Cap at 3.
- `status:ready` = ap-ready yes. `status:needs-refinement`, `status:blocked`, `status:deferred` = ap-ready no, each with the reason in the issue or brief.

## Areas

`area:ux` (web UI, layout, copy, a11y), `area:api` (Minimal API endpoints and handlers), `area:db` (EF Core, migrations, SQL), `area:auth` (Cognito, roles, authorization), `area:admin`, `area:study`, `area:games`, `area:analytics`, `area:study-guides`, `area:question-images`, `area:content` (seed data, taxonomy, exam sets), `area:ci`, `area:cd`, `area:infra` (AWS, Lightsail, Supabase, SES, Cognito config), `area:automation` (`.claude/**`, `scripts/automation`, bundle tooling), `area:perf`, `area:docs`, `area:testing`. Add a new area only when 3 or more issues need it.

## Sizes

- `size:xs`: under about an hour, one file or doc. Item-data fixes are always xs.
- `size:s`: about half a day, one vertical slice.
- `size:m`: about a day, a few slices or one slice plus a migration.
- `size:l`: more than a day. Split before ready. No `size:xl`.

## Inference rules for refine

- **Size:** infer from the analysis (scope paths, slices, migration). If missing, set it. If the analysis is larger than the label, raise it and say so in the brief. Never lower an existing label without asking. `l` means `too-large`: exclude and propose a split.
- **Priority:** never infer (product choice). Keep an existing label. If none, ask once in the question batch with a recommendation; if unanswered, `priority:med`.
- **Area:** infer from `scope.paths`, without asking: `checks.web.prefix` + `**` → ux; `checks.api.featuresPrefix` + `<X>` → api plus the feature area; `Migrations/**` → db; `ci.yml` → ci; `deploy.yml` / `rollback.yml` → cd; `data/seed-*` → content; `.claude/**` and `scripts/automation/**` → automation. Keep at most 3. Never remove an area a human set; list suspicious ones in the brief.
- **Type:** infer (seed-data-only is `type:content`, no behavior change is `type:chore`). Ask only between `type:decision` and `type:implementation`.
- **Status / owner:** bundled `ok` issues → `status:ready` + `owner:agent`. `blocked-external` → `status:blocked` + `owner:human`. `too-large`, `stale`, `risky` → `status:needs-refinement`. `duplicate` / `already-done` → propose closing with `resolution:duplicate` (closing needs the user's confirmation).
- **Contradictions** (e.g. `size:l` + `status:ready`, `owner:human` + `status:ready`): list them in the brief and fix only inside the approved label set.

## Repo label names

Labels in this taxonomy may not all exist in the repo yet. Refine must not create labels; if a label is missing, name it in the brief and ask whether to create it (creating labels is a repo write).
