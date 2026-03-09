---
name: summarize-and-commit
description: Summarize uncommitted git changes with AI and commit to the current feature branch. Use when the user says "summarize and commit", "commit my changes", "smart commit", "commit with summary", or similar. If on main/master, do not commit and ask to create a feature branch first.
---

# Summarize and Commit

When the user invokes this skill (e.g. "summarize and commit" or "commit my changes"):

## 1. Check branch

- Run `git branch --show-current` to get the current branch.
- If the branch is `main` or `master`: **stop**. Reply with a short message asking them to create a feature branch first, e.g. `git checkout -b feature/short-name`. Do not commit.

## 2. Get uncommitted changes

- Run `git status` (and optionally `git status --short`).
- Run `git diff` for unstaged changes and `git diff --cached` for staged changes (or `git diff` alone if you want all working tree changes).
- Read the diff output so you can summarize it.

## 3. Summarize with AI

- Write a **short commit title** (one line, under ~72 chars) that describes what the changes do in plain language (e.g. "Add explore mode filters and item collection controls", "Fix API client error handling").
- Write a **commit body** with a concise bullet list of the main changes (what was added, fixed, or refactored), based on the actual diff. Do not just list file names; describe the changes.

## 4. Commit

- Run `git add -A`.
- Run `git commit` with your title as the subject and the bullet list as the body. Use two `-m` arguments if the shell supports it, e.g. `git commit -m "Title" -m "Body bullets..."`, or use a temporary commit message file and `git commit -F path`.

## 5. Confirm

- Tell the user the commit was created on the current branch and show the title (and optionally the body).

## How to invoke

User can say in chat, for example:
- "Summarize and commit"
- "Commit my changes"
- "Smart commit"
- "Commit with summary"

The skill description ensures the agent applies this workflow when the user asks for this.

## Notes

- If there are no uncommitted changes, say so and do not run commit.
- Prefer present tense and imperative in the title (e.g. "Add X", "Fix Y").
- Keep the body to a few bullets; focus on intent and impact, not every line changed.
