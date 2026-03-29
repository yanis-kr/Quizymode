"""
Strip PDF page markers and annotate outdated AWS naming in exams.aws.saa-c03-p*.json bulk seed files.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXAMS = ROOT / "data" / "seed-source" / "items" / "exams"
GLOB = "exams.aws.saa-c03-p*.json"

# Standard PDF footer and occasional OCR-broken variants (e.g. "--- Page&").
PAGE_RE = re.compile(r"\s*---\s*Page\s+\d+\s*---\s*", re.MULTILINE)
PAGE_BROKEN_RE = re.compile(r"\s*---\s*Page&+\s*")

# Longest / most specific replacements first (plain string replaces).
STRING_REPLACEMENTS: list[tuple[str, str]] = [
    (
        "Amazon OpenSearch Service (Amazon Elasticsearch Service)",
        'Amazon OpenSearch Service (note: outdated dual label; formerly Amazon Elasticsearch Service)',
    ),
    (
        "Amazon EventBridge (Amazon Cloud Watch Events)",
        'Amazon EventBridge (note: outdated alias "Amazon CloudWatch Events"; same service, now EventBridge)',
    ),
    (
        "Amazon EventBridge (Amazon CloudWatch Events)",
        'Amazon EventBridge (note: outdated alias "Amazon CloudWatch Events"; same service, now EventBridge)',
    ),
    (
        "EventBridge (Cloud Watch Events)",
        'EventBridge (note: outdated alias "CloudWatch Events")',
    ),
    (
        "EventBridge (CloudWatch Events)",
        'EventBridge (note: outdated alias "CloudWatch Events")',
    ),
]

# Idempotent annotations (safe if the script runs more than once).
FH_NOTE = "(note: outdated; now Amazon Data Firehose)"
KA_NOTE = (
    "(note: outdated; now Amazon Managed Service for Apache Flink "
    "for SQL/streaming analytics workloads)"
)


def _collapse_repeated_note(s: str, note: str) -> str:
    esc = re.escape(note)
    return re.sub(rf"(?:{esc}\s*){{2,}}", note, s)


def transform_string(s: str) -> str:
    if not isinstance(s, str):
        return s
    out = PAGE_RE.sub("", s)
    out = PAGE_BROKEN_RE.sub("", out)
    # Obvious OCR for AWS Config
    out = out.replace("AWS Cong", "AWS Config")
    for old, new in STRING_REPLACEMENTS:
        out = out.replace(old, new)

    fh_esc = re.escape(FH_NOTE)
    out = re.sub(
        rf"Amazon Kinesis Data Firehose(?!\s*{fh_esc})",
        f"Amazon Kinesis Data Firehose {FH_NOTE}",
        out,
    )
    out = re.sub(
        rf"(?<!Amazon )Kinesis Data Firehose(?!\s*{fh_esc})",
        f"Kinesis Data Firehose {FH_NOTE}",
        out,
    )

    ka_esc = re.escape(KA_NOTE)
    out = re.sub(
        rf"Amazon Kinesis Data Analytics(?!\s*{ka_esc})",
        f"Amazon Kinesis Data Analytics {KA_NOTE}",
        out,
    )
    out = re.sub(
        rf"(?<!Amazon )Kinesis Data Analytics(?!\s*{ka_esc})",
        f"Kinesis Data Analytics {KA_NOTE}",
        out,
    )

    out = _collapse_repeated_note(out, FH_NOTE)
    out = _collapse_repeated_note(out, KA_NOTE)
    # PDF/OCR often dropped the space before the next word after "Firehose" / analytics note.
    out = re.sub(re.escape(FH_NOTE) + r"([A-Za-z])", FH_NOTE + r" \1", out)
    out = re.sub(re.escape(KA_NOTE) + r"([A-Za-z])", KA_NOTE + r" \1", out)
    return out


def walk(obj):
    if isinstance(obj, dict):
        return {k: walk(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [walk(x) for x in obj]
    if isinstance(obj, str):
        return transform_string(obj)
    return obj


def main() -> None:
    paths = sorted(EXAMS.glob(GLOB))
    if not paths:
        raise SystemExit(f"No files matching {GLOB} under {EXAMS}")
    for path in paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        cleaned = walk(data)
        path.write_text(
            json.dumps(cleaned, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(path.name)


if __name__ == "__main__":
    main()
