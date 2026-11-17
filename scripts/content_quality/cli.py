#!/usr/bin/env python3
"""CLI for the seed review ledger (#726). Run by path: python scripts/content_quality/cli.py <command> ..."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from quality_lib import (  # noqa: E402
    append_rows,
    compact,
    ingest,
    ledger_path,
    legacy_rows,
    load_fact_checks,
    packet,
    pr_table,
    queue,
    read_rows,
)
from seed_source_common import SOURCE_ITEMS_ROOT, load_source_items  # noqa: E402


def cmd_queue(args: argparse.Namespace) -> int:
    items = [i for i in load_source_items() if i.category == args.category]
    rows = read_rows(ledger_path(args.category))
    for item in queue(items, rows, args.level, args.budget):
        print(json.dumps({"itemId": item.item_id, "question": item.question}))
    return 0


def cmd_packets(args: argparse.Namespace) -> int:
    items = [i for i in load_source_items() if i.category == args.category]
    for item in items[: args.limit]:
        print(json.dumps(packet(item, args.level, args.seed)))
    return 0


def cmd_ingest(args: argparse.Namespace) -> int:
    items = {i.item_id: i for i in load_source_items()}
    verdicts = [json.loads(line) for line in Path(args.file).read_text(encoding="utf-8").splitlines() if line.strip()]
    accepted, rejected = ingest(verdicts, items)
    by_category: dict[str, list[dict]] = {}
    for row in accepted:
        category = items[row["itemId"]].category
        by_category.setdefault(category, []).append(row)
    for category, rows in by_category.items():
        append_rows(ledger_path(category), rows)
    for message in rejected:
        print(f"REJECTED {message}", file=sys.stderr)
    print(f"accepted {len(accepted)}, rejected {len(rejected)}")
    return 1 if rejected else 0


def cmd_legacy_import(_: argparse.Namespace) -> int:
    items = load_source_items()
    fact_checks = load_fact_checks(SOURCE_ITEMS_ROOT)
    total = 0
    for category in sorted({i.category for i in items}):
        scope = [i for i in items if i.category == category]
        path = ledger_path(category)
        total += append_rows(path, legacy_rows(scope, fact_checks, read_rows(path)))
    print(f"imported {total} legacy rows")
    return 0


def cmd_compact(args: argparse.Namespace) -> int:
    path = ledger_path(args.category)
    rows = compact(read_rows(path))
    path.write_text("".join(json.dumps(r, sort_keys=True, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    print(f"{len(rows)} rows kept in {path.name}")
    return 0


def cmd_pr_table(args: argparse.Namespace) -> int:
    rows = read_rows(ledger_path(args.category))
    print(pr_table(rows, set(args.ids)))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    q = sub.add_parser("queue", help="items needing review at a level")
    q.add_argument("--category", required=True)
    q.add_argument("--level", required=True)
    q.add_argument("--budget", type=int, default=25)
    q.set_defaults(func=cmd_queue)

    p = sub.add_parser("packets", help="JSONL packets for a level")
    p.add_argument("--category", required=True)
    p.add_argument("--level", required=True)
    p.add_argument("--seed", required=True)
    p.add_argument("--limit", type=int, default=25)
    p.set_defaults(func=cmd_packets)

    i = sub.add_parser("ingest", help="validate verdicts and append ledger rows")
    i.add_argument("--file", required=True)
    i.set_defaults(func=cmd_ingest)

    sub.add_parser("legacy-import", help="import factChecks as legacy-unverified rows").set_defaults(func=cmd_legacy_import)

    c = sub.add_parser("compact", help="keep the latest row per item, level and rubric")
    c.add_argument("--category", required=True)
    c.set_defaults(func=cmd_compact)

    t = sub.add_parser("pr-table", help="Markdown evidence table for item ids")
    t.add_argument("--category", required=True)
    t.add_argument("ids", nargs="+")
    t.set_defaults(func=cmd_pr_table)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
