# Claude provider adapter (draft)

This directory implements the **Claude-side half** of Quizymode's shared autonomous workflow: specialist agent definitions under `.claude/agents/`, and a provider adapter (`claude-adapter.mjs`) that drives the subscription-authenticated `claude` CLI per specialist role.

## Status: blocked on the shared contract

As of 2026-10-15, there is no shared release-controller contract committed anywhere in this repo — no `docs/automation/workflow.md`, no scheduler, no durable state store, no issue-claim mechanism, no artifact publisher, no global release lock. A separate local worktree (branch `codex/automation-bootstrap`) exists and is presumably where that work is happening, but nothing beyond `main` is committed to it yet, so its real interface is unknown from here.

`controller-contract.stub.mjs` is a **draft stand-in only**, written so the adapter has something concrete to test against. Do not treat it as the real contract. When the real shared contract lands:

1. Replace every import of `controller-contract.stub.mjs` with the real module.
2. Re-run `node --test scripts/automation/claude-adapter.test.mjs` — it's written to fail loudly on shape mismatches.
3. Reconcile `MODEL_ASSIGNMENTS`, evidence field names, and role names against whatever the real contract defines; this draft's names are best guesses from the task description, not confirmed.
4. Propose any shared-contract changes explicitly and coordinate with the Codex-side owner rather than editing their side unilaterally.

## Verifying CLI capabilities

```powershell
claude --version
claude auth status
```

Expect `loggedIn: true`, `authMethod: "claude.ai"`, `apiProvider: "firstParty"`. If `apiProvider` is anything else, that's a paid API-key fallback, which this adapter forbids (`checkCliCapabilities` throws `PAID_API_FALLBACK_FORBIDDEN`).

Model availability on this account (checked at build time, 2026-10-15): `claude --version` → `2.1.218`, subscription type `pro`.

## Role → model assignment

| Role | Primary model | Fallback | Why |
|---|---|---|---|
| architect | opus | sonnet | architecture reasoning |
| ux-designer | sonnet | sonnet | — |
| reviewer | opus | sonnet | independent review |
| coder | sonnet | sonnet | — |
| tester | sonnet | sonnet | — |
| reporter | haiku | sonnet | narrow report formatting |

`resolveModel(role, { availableModels })` returns `{ model, substituted, reason }` — if the primary isn't in `availableModels`, the substitution is explicit and recorded, never silent.

## Running the adapter's own tests

No extra dependencies — uses Node's built-in test runner:

```powershell
node --test scripts/automation/claude-adapter.test.mjs
```

18 tests cover: successful handoff, malformed CLI output, interruption/resume via `--resume`, quota/overload backoff (retry then succeed, and exhausting retries), a non-quota failure not being retried, the `bypassPermissions` policy guard, conflict-resolution re-entry, and evidence-completeness validation (including rejecting a PASS claim with no test/evidence link).

## Dry-run

To prove the adapter actually drives the real CLI (not just the mocked unit tests), run one specialist role read-only against a real open issue, writing nothing to GitHub or the worktree:

```powershell
node scripts/automation/dry-run.mjs --issue 133 --role architect
```

See `dry-run.mjs` for the exact invocation. This talks to the real `claude` CLI under your subscription — it is not free, but it is cheap (one short Sonnet/Opus call), and does not touch GitHub.

## What this does NOT do yet

- Does not claim an issue, write durable state, or take the global release lock — those belong to the shared controller.
- Does not merge PRs or deploy anything.
- Does not auto-enable unattended releases — per the task that produced this draft, that stays off during setup even once the rest of this works end to end.
- Reporter's `gh issue comment` / `gh pr comment` calls are illustrative in the agent prompt, not wired into `claude-adapter.mjs` — publishing goes through the real shared artifact mechanism once it exists.
