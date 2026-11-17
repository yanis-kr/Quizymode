# Content quality: review ledger and evidence packets

Status: tooling only (#726, #769). No model calls, no item edits. Fetching is polite and cached (#769).

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
