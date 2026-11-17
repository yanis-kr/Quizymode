# Content quality: review ledger and evidence packets

Status: tooling only (#726). No model calls, no fetching, no item edits.

- Ledger: `data/seed-source/_registry/quality/<category>.jsonl`, one row per item, content hash, level and rubric version. Commit the rows; compact with `cli.py compact`.
- Source cache: `.cache/content-quality/` (git-ignored). Its file format is defined in `scripts/content_quality/quality_lib.py` (`cache_path`, `read_cache`). Page text is never committed.
- Commands (run from the repo root):

```bash
python scripts/content_quality/cli.py queue --category exams --level L1 --budget 25
python scripts/content_quality/cli.py packets --category exams --level L2 --seed 2026-11-17
python scripts/content_quality/cli.py ingest --file verdicts.jsonl
python scripts/content_quality/cli.py legacy-import
python scripts/content_quality/cli.py compact --category exams
python scripts/content_quality/cli.py pr-table --category exams <itemId> [<itemId> ...]
```

- Evidence rule: a verdict counts only when its quote is found in the cached source text. Verdicts without a quote are recorded as opinions, not evidence.
- Follow-up (not built yet): the source fetcher, `robots.txt` handling, the link report, the source-tier config and re-queue on source changes.
