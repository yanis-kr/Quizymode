---
name: summarize-and-commit
description: Summarize uncommitted git changes with AI and commit to the current feature branch. Runs unit tests with coverage and includes line/branch coverage in the commit. Never commit if tests fail. Use when the user says "summarize and commit", "commit my changes", "smart commit", "commit with summary", or similar. If on main/master, do not commit and ask to create a feature branch first.
---

# Summarize and Commit

When the user invokes this skill (e.g. "summarize and commit" or "commit my changes"):

## 1. Check branch

- Run `git branch --show-current` to get the current branch.
- If the branch is `main` or `master`: **stop**. Reply with a short message asking them to create a feature branch first, e.g. `git checkout -b feature/short-name`. Do not commit.

## 2. Run unit tests with coverage

- Run the test project with coverage, e.g. `dotnet test --collect:"XPlat Code Coverage" --results-directory TestResults` (from repo root; use the actual test project path, e.g. `tests/Quizymode.Api.Tests/Quizymode.Api.Tests.csproj` or the solution).
- If any test fails: **stop**. Do not run steps 3–5 and do not commit. Report the failure(s) to the user and end the workflow.
- After a successful run, get **line coverage %** and **branch coverage %** from the coverage report. The report is written to `TestResults/<run-id>/coverage.cobertura.xml`. The root `<coverage>` element has attributes `line-rate` and `branch-rate` (decimals 0–1); convert to percentages (e.g. 0.16 → 16%).
- If no coverage file is found (e.g. no test project or collector not used), omit coverage from the commit body and note it in the confirmation.

## 3. Get uncommitted changes

- Run `git status` (and optionally `git status --short`).
- Run `git diff` for unstaged changes and `git diff --cached` for staged changes (or `git diff` alone if you want all working tree changes).
- Read the diff output so you can summarize it. **If the diff is very large** (e.g. many files or thousands of lines), use `git diff --stat` plus a subset of changed files for the summary instead of loading the full diff, to reduce token usage.

## 4. Summarize with AI

- Write a **short commit title** (one line, under ~72 chars) that describes what the changes do in plain language (e.g. "Add explore mode filters and item collection controls", "Fix API client error handling").
- Write a **commit body** with:
  - A concise bullet list of the main changes (what was added, fixed, or refactored), based on the actual diff. Do not just list file names; describe the changes.
  - A final line with test and coverage: e.g. `Tests: 113 passed. Line coverage: 16%, Branch coverage: 17%.` (use the actual counts and percentages from step 2).

## 5. Commit

- Run `git add -A`.
- Run `git commit` with your title as the subject and the bullet list (including the tests/coverage line) as the body. Use two `-m` arguments if the shell supports it, e.g. `git commit -m "Title" -m "Body bullets..."`, or use a temporary commit message file and `git commit -F path`.

## 6. Confirm

- Tell the user the commit was created on the current branch and show the title, the body (or a short summary), and the tests/coverage line.

## How to invoke

User can say in chat, for example:
- "Summarize and commit"
- "Commit my changes"
- "Smart commit"
- "Commit with summary"

The skill description ensures the agent applies this workflow when the user asks for this.

## Notes

- **Never commit if tests fail.** Only proceed to summarize and commit after a successful test run.
- If there are no uncommitted changes, say so and do not run commit.
- Prefer present tense and imperative in the title (e.g. "Add X", "Fix Y").
- Keep the body to a few bullets; focus on intent and impact, not every line changed.

## Minimizing token usage (for the user)

- **Use a new chat** when invoking (e.g. open a new Composer/Agent tab, or start a new chat). That way there is no prior conversation history and the skill runs with minimal context.
- **Invoke only for this task** in that chat—run the skill, get the commit, then close; avoid long back-and-forth in the same thread.
- The agent will use `git diff --stat` plus a subset of files when the diff is very large, to avoid loading huge diffs into context.
