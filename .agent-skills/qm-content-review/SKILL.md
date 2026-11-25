---
name: qm-content-review
description: Run budgeted, evidence-backed quality reviews for Quizymode seed content, including calibration, exam pilots, and resumable ledger updates.
argument-hint: "<category or set> [item budget]"
---

# Quizymode Content Review

Scope: `$ARGUMENTS`. If no scope is named, ask for a category or set. Default to a 25-item budget. Never start more items than the requested budget.

This skill uses the Codex CLI models in `model-config.json` through the signed-in ChatGPT subscription. Do not configure an API key or paid API billing. Run `codex login status` only to verify login; never print account details. If the CLI is not authenticated, stop before model calls.

## Review levels

Read `references/rubric-v1.md` and `model-config.json`. Record the exact model ID, rubric version, call ID, and available input/output token counts for each run. Keep usage fields explicitly null when the CLI does not return them.

- **L1 blind answer:** batches of at most 25. Use only the generated question and shuffled choices. Do not expose the stored key, explanation, labels, expected answer, source, or prior findings. Record one selected option, ambiguity flag, and three-level difficulty.
- **L2 source-grounded:** run for every exam item and for non-exam items flagged by lint or L1. Supply the stored key, explanation, and at most 600 words from a cached eligible source. For exams, the source must be T1 vendor or standards-body documentation. A `source-verified` verdict and every change finding require a quote from the supplied passage. If the cited source is unavailable or ineligible, select a suitable replacement and fetch it. If no eligible passage is available, record `unverified` with the evidence gap; do not infer a verdict.
- **L3 adjudication:** run in a fresh `codex exec` session for proposed exam key or distractor changes and unresolved disagreement among the key, L1 and L2. Supply a second eligible passage and structured findings only. Do not include prior reviewers' rationale. A change is withheld unless the independent result and second quote support it.

## Calibration gate

Calibration labels and expected answers are stored separately from reviewer packets. Never copy those fields into a prompt. The committed fixture is `data/seed-source/_registry/quality/calibration-fixture.jsonl` (591 rows: 384 historical wrong keys and 157 known-good controls from #683 at origin commit `0c7fbdb9`, and 50 seeded wrong keys at origin commit `b8c16654`). Each row carries the item ID, label, origin commit, label source, expected answer, content hash and eligible source URL. Counts are in `calibration-fixture-summary.json`. The 157 controls are reconstructed because #683 published only an aggregate for them (see `reconstruct_683.py`).

1. Check the fixture and rebuild the reviewer items from git history (read-only, no model calls): `python scripts/content_quality/fixture_tools.py check` and `python scripts/content_quality/fixture_tools.py rebuild --output .cache/content-quality/727/calibration/items.jsonl`. The rebuild verifies every content hash against the fixture.
2. Fetch the eligible sources into the git-ignored cache with `cli.py fetch --item-ids <file> --eligible-only` (polite, cached, robots.txt honoured).
3. Run the first 25-item smoke batch with `calibration_cli.py run-fixture --level L1 --budget 25 --output <results>`; inspect blind packet integrity, eligible-source coverage, exact model IDs, and measured usage before continuing. `--budget` is the total number of items the run may start, in calls of at most 25. Completed rows at the same content hash, level and rubric version are skipped, so an unchanged rerun makes zero calls. Continue only within available subscription quota.
4. Run L2 for every fixture item with an eligible cached source, then regenerate the report with no model calls: `calibration_cli.py calibration-report`. It writes `calibration-report.json` with L1, L2 and combined results, the seeded-error catch rate, source gaps, items not yet run, and usage by level. A historical wrong key counts as caught only with a quote verified against cached source text. A known-good item is a false flag only when the workflow concludes that an answer or content fix is needed. A seeded label accepts only a row reviewed at the seeded content hash.
5. `calibration_cli.py pilot-gate` exits 1 unless the report is complete, was produced at the current rubric version, has combined recall of at least 90% and a known-good false-flag rate below 20%. If it exits 1, revise and version the rubric, rerun calibration, and do not start the pilot.

## Exam pilot

After a passing calibration, pilot only the non-AWS exam sets. Determine the current item count from the seed files; do not assume the stale estimate in the issue. Run explicit budgeted batches beginning at 25, and check quota and measured usage before increasing a later budget. L1 and L2 cover every pilot exam item. Record source gaps without marking those items verified. Run L3 only for the cases defined above.

Generate a report per set with items and calls per level, flags, source gaps, model IDs, rubric version, and measured tokens per item and level beside the estimates in #724 section H. Keep incomplete rows resumable from the ledger. Generate a separate independent review of up to 30 actual fixes from a fresh context; report agree, weak, disagree, and any sample shortfall.

## Change proposals

- Create item-only fix batches with one set and one change class per PR, at most 25 changed items, riskiest first. Include generated before/after evidence, quote, URL, and level outcomes.
- Class A is text, explanation, or source. Class B is a key or distractor and requires quote-backed L2 plus a supporting independent L3 decision. Class C is removal and requires separate owner review and the established removal path.
- Keep all item changes under `data/seed-source/items/**` and evidence under `data/seed-source/_registry/**`. Never apply a production seed sync without the owner's explicit approval; preview first and verify the intended IDs after an approved apply.

## Commands

Run from the repository root. Review scripts cap packet generation and model calls to the requested budget. Steps that call a model need the signed-in Codex CLI and run only in a session the owner started.

```powershell
python scripts/content_quality/fixture_tools.py check
python scripts/content_quality/fixture_tools.py rebuild --output .cache/content-quality/727/calibration/items.jsonl
python scripts/content_quality/cli.py fetch --category exams --item-ids .cache/content-quality/pilot-ids.txt --eligible-only
python scripts/content_quality/cli.py queue --category exams --level L1 --budget 25
python scripts/content_quality/cli.py packets --category exams --level L1 --seed 727 --budget 25
python scripts/content_quality/model_review.py --level L1 --packets .cache/content-quality/l1-packets.jsonl --output .cache/content-quality/l1-results.jsonl --budget 25
python scripts/content_quality/calibration_cli.py run-fixture --items .cache/content-quality/727/calibration/items.jsonl --level L2 --budget 25 --output .cache/content-quality/727/calibration/l2-results.jsonl
python scripts/content_quality/calibration_cli.py calibration-report
python scripts/content_quality/calibration_cli.py pilot-gate
python scripts/content_quality/calibration_cli.py pilot-report --category exams --set-name <set> --item-ids <file> --output <report.json>
python scripts/content_quality/cli.py pr-table --category exams --change-class B --changes <changes.jsonl> <itemId>
python scripts/content_quality/calibration_cli.py check-pr --changes <changes.jsonl>
python scripts/content_quality/calibration_cli.py recheck-sample --changes <changes.jsonl> --seed 727
```

`check-pr` rejects a batch that mixes sets or change classes, exceeds 25 items, or touches paths other than `data/seed-source/items/**` and `data/seed-source/_registry/**`. `recheck-sample` picks up to 30 fixes for the fresh-context recheck and reports the shortfall when fewer exist.

Never commit fetched page text or labels in a reviewer packet. Commit only the labeled fixture, review ledger rows, and generated reports that contain no source page text.
