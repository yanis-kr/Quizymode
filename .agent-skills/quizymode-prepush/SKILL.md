---
name: quizymode-prepush
description: Verify Quizymode work before push, including conditional checks, high-risk scans, and a markdown diff-to-main checklist.
---

# Quizymode Pre-Push

Use this skill when the user asks to prepare Quizymode work for push, run pre-push checks, verify a branch, or produce a ready-to-push summary.

## Scope

Operate from the Quizymode repo root. Treat the effective push scope as the union of:

- committed changes from the current branch compared to `main`
- staged changes
- unstaged changes
- untracked files that appear relevant to the change

## Diff-To-Main Summary

Before running long checks, inspect and summarize the effective diff to `main`.

1. Identify the current branch:
   - `git branch --show-current`
2. Resolve the base branch:
   - prefer `origin/main` if present locally
   - otherwise use `main`
3. Inspect committed branch scope:
   - `git log --oneline <base>..HEAD`
   - `git diff --stat <base>...HEAD`
4. Inspect working tree scope:
   - `git status --short`
   - `git diff --stat`
   - `git diff --cached --stat` when staged changes exist
5. Read key changed files when commit titles and diff stats are not enough.
6. Produce the change summary as a fenced `md` code block. The `## Summary` section must use only checked checklist items (`- [x]`) for changes that are present in the effective diff:

```md
## Summary
- [x] First concrete change
- [x] Second concrete change
- [x] Third concrete change

## Verification
- [x] Command or check that passed
- [ ] Command not run, with reason
```

Checklist items should be concrete and outcome-focused. Prefer 3-7 summary items. Mention docs, tests, generated artifacts, and local-only review artifacts when present.

## Verification Workflow

Run the checks that match the effective diff. Do not report ready-to-push work until required checks have passed or you have clearly stated why they could not be run.

### Backend

If any `.cs` file changed, run:

```bash
dotnet test
```

### Frontend

If any file under `src/Quizymode.Web/src/` changed, run both:

```bash
cd src/Quizymode.Web
npm run build
npm test -- --run
```

A passing frontend build alone is not enough. Always run the frontend tests too when frontend source changed.

### OpenAPI

If API surface changed, regenerate and verify the checked-in OpenAPI artifact with:

```powershell
.\scripts\verify-openapi.ps1 -Configuration Release
```

Do not hand-edit `docs/openapi/quizymode-api.json` unless explicitly repairing the generation path.

## High-Risk Change Scans

When a record or class constructor signature changed, search all usages across the repo, including tests, and update call sites:

```bash
rg "LoadedGitHubSeedManifest|OtherTypeName" -g "*.cs"
```

When a React UI element was removed or renamed, search corresponding tests for stale text, role, label, or attribute assertions:

```bash
rg "removed-text|removed-link" src/Quizymode.Web/src -g "*.test.*"
```

When a variable is declared inside an early-return `if` block in a React component, confirm it is not referenced outside that block. If it is referenced by sibling branches or later JSX, hoist it to component scope before the first return.

## Completion Rules

- Update `docs/AC.md` in the same change when behavior, authorization, contract intent, or other user-visible logic changes.
- Bump `QuizymodeVersion` in `Directory.Build.props` for completed repo changes and keep `src/Quizymode.Web/package.json` aligned.
- Include a short conventional-commit title suggestion in the final response.
- Report verification commands with pass/fail status.
