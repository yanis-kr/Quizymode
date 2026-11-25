# Content quality: review ledger and evidence packets

Status: tooling (#726, #769) and the tiered review skill with its calibration gate (#727). The scripts make no model calls themselves except `model_review.py`, which a human or an owner-started session runs through the Codex CLI. No item edits.

- Ledger: `data/seed-source/_registry/quality/<category>.jsonl`, one row per item, content hash, level and rubric version. Commit the rows; compact with `cli.py compact`.
- Source cache: `.cache/content-quality/` (git-ignored). Its file format is defined in `scripts/content_quality/quality_lib.py` (`cache_path`, `read_cache`). Page text is never committed.
- Commands (run from the repo root):

```bash
python scripts/content_quality/cli.py fetch --category exams --delay 1.0
python scripts/content_quality/cli.py link-report --category exams
python scripts/content_quality/cli.py queue --category exams --level L1 --budget 25
python scripts/content_quality/cli.py packets --category exams --level L2 --seed 2026-11-17
python scripts/content_quality/cli.py ingest --file verdicts.jsonl
python scripts/content_quality/cli.py legacy-import
python scripts/content_quality/cli.py compact --category exams
python scripts/content_quality/cli.py pr-table --category exams <itemId> [<itemId> ...]
```

- Evidence rule: a verdict counts only when its quote is found in the cached source text. Verdicts without a quote are recorded as opinions, not evidence.
- Fetcher (`fetch`): one request per URL per run, cached URLs skipped for 90 days, `robots.txt` honoured, a generic client name, a per-domain delay that doubles on 429, Wikipedia through its API (plain-text extract and revision id). A blocked or failing fetch is recorded as `unfetchable` with no retry. Bot detection is not worked around.
- Source tiers: `data/seed-source/_registry/quality/source_tiers.json` (by domain). Profiles: `profiles.json` (stakes, minimum tier, review interval).
- Queue order: risk = source tier times profile stakes, highest first. Each item carries a reason: no ledger row, content changed, review interval passed, or source text changed.

## Tiered review and calibration (#727)

- Skill: `.agent-skills/qm-content-review/` (`SKILL.md`, `model-config.json` for model IDs and rubric version, `references/rubric-v1.md`). L1 is a blind answer (batches of at most 25), L2 is a source-grounded review with a verbatim quote, L3 is an independent adjudication in a fresh context for exam key or distractor changes.
- Ingest rules: a `source-verified` row needs an L2 or L3 quote that is found in the cached source text, and exam sources must be tier T1 (`profiles.json` `exams.minTier`). A class B change needs a quote-backed L2 row and an L3 row with `supports-change` (`cli.py pr-table --change-class B`).
- Budget and resume: `queue`, `packets` and `calibration_cli.py run-fixture` start at most `--budget` items in total (calls of at most 25) and skip rows at the same content hash, level and rubric version, so an unchanged rerun makes no calls. Every call records the model ID, call ID and token counts, with `null` and `usageAvailable: false` when the CLI returns none.
- Fixture: `data/seed-source/_registry/quality/calibration-fixture.jsonl` (591 labels: 384 historical wrong keys, 157 known-good, 50 seeded wrong keys) with counts in `calibration-fixture-summary.json`. `fixture_tools.py rebuild` recreates the reviewer items from git history and checks every content hash. Labels and expected answers never enter a reviewer packet.
- Calibration ledger: `calibration.jsonl` (results of the reviewer runs on the fixture). `calibration_cli.py calibration-report` scores it with no model calls and writes `calibration-report.json`. `pilot-gate` exits 1 until the report is complete, current for the rubric version, has recall of at least 90% on historical wrong keys and a known-good false-flag rate below 20%. Evidence gaps are reported separately and count as misses for recall.
- Fix batches: `calibration_cli.py check-pr` allows one set, one change class (A text, B key or distractor, C removal), at most 25 items, and only `data/seed-source/items/**` and `data/seed-source/_registry/**` paths. `recheck-sample` picks up to 30 fixes for the fresh-context recheck.
