#!/usr/bin/env python3
"""CLI for the seed review ledger (#726). Run by path: python scripts/content_quality/cli.py <command> ..."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from datetime import datetime, timezone  # noqa: E402

from fetcher import (  # noqa: E402
    fetch_run,
    link_report,
    load_profiles,
    load_tiers,
)
from quality_lib import (  # noqa: E402
    append_rows,
    compact,
    cache_is_ok,
    eligible_source_url,
    ingest,
    item_source_candidates,
    ledger_path,
    legacy_rows,
    load_fact_checks,
    packet,
    pr_table,
    proposal_evidence_table,
    read_rows,
    read_cache,
    risk_queue,
    validate_proposal,
)
from seed_source_common import SOURCE_ITEMS_ROOT, load_source_items  # noqa: E402


def cmd_queue(args: argparse.Namespace) -> int:
    items = [i for i in load_source_items() if i.category == args.category]
    rows = read_rows(ledger_path(args.category))
    ranked = risk_queue(items, rows, args.level, args.budget, load_tiers(), load_profiles(), datetime.now(timezone.utc))
    for item, reason, risk in ranked:
        print(json.dumps({"itemId": item.item_id, "question": item.question, "risk": risk, "reason": reason}))
    return 0


def _category_items(category: str | None):
    return [i for i in load_source_items() if category is None or i.category == category]


def cmd_fetch(args: argparse.Namespace) -> int:
    items = _category_items(args.category)
    item_ids = {line.strip() for line in args.item_ids.read_text(encoding="utf-8").splitlines() if line.strip()} if args.item_ids else None
    if item_ids is not None:
        items = [item for item in items if item.item_id in item_ids]
    urls = [url for item in items for url in item_source_candidates(item)]
    if args.eligible_only:
        tiers = load_tiers()
        profiles = load_profiles()
        minimums = {category: profile.get("minTier", "T5") for category, profile in profiles.items()}
        urls = [
            url for item in items for url in item_source_candidates(item)
            if eligible_source_url(item, tiers, minimums.get(item.category, minimums.get("default", "T5"))) == url
        ]
    if args.limit:
        urls = urls[: args.limit]
    summary = fetch_run(urls, base_delay=args.delay)
    print(json.dumps(summary.as_dict(), sort_keys=True))
    return 0


def cmd_link_report(args: argparse.Namespace) -> int:
    items = _category_items(args.category)
    urls_by_item = {i.item_id: i.source for i in items if i.source}
    print(json.dumps(link_report(urls_by_item, load_tiers()), indent=2, sort_keys=True))
    return 0


def cmd_packets(args: argparse.Namespace) -> int:
    items = [i for i in load_source_items() if i.category == args.category]
    rows = read_rows(ledger_path(args.category))
    tiers = load_tiers()
    profiles = load_profiles()
    ranked = risk_queue(items, rows, args.level, args.budget, tiers, profiles, datetime.now(timezone.utc))
    gaps = 0
    for item, _, _ in ranked:
        source_url = None
        if args.level in {"L2", "L3"}:
            profile = profiles.get(item.category, profiles["default"])
            source_url = eligible_source_url(item, tiers, profile.get("minTier", "T5"))
            cached = read_cache(source_url) if source_url else None
            if not cache_is_ok(cached):
                print(f"SOURCE_GAP {item.item_id}: no cached eligible source", file=sys.stderr)
                gaps += 1
                continue
        print(json.dumps(packet(item, args.level, args.seed, source_url=source_url)))
    if gaps:
        print(f"source gaps {gaps}; no packet was emitted for those items", file=sys.stderr)
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
    if args.changes:
        changes = [json.loads(line) for line in args.changes.read_text(encoding="utf-8").splitlines() if line.strip()]
        print(proposal_evidence_table(rows, changes))
        return 0
    if args.change_class:
        for item_id in args.ids:
            validate_proposal(item_id, args.change_class, rows)
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

    f = sub.add_parser("fetch", help="fetch uncached source URLs once each, politely (robots.txt, per-domain delay)")
    f.add_argument("--category")
    f.add_argument("--limit", type=int, default=0)
    f.add_argument("--delay", type=float, default=1.0)
    f.add_argument("--item-ids", type=Path)
    f.add_argument("--eligible-only", action="store_true")
    f.set_defaults(func=cmd_fetch)

    lr = sub.add_parser("link-report", help="status, tier and bare-homepage counts for cited source URLs")
    lr.add_argument("--category")
    lr.set_defaults(func=cmd_link_report)

    p = sub.add_parser("packets", help="JSONL packets for a level")
    p.add_argument("--category", required=True)
    p.add_argument("--level", required=True)
    p.add_argument("--seed", required=True)
    p.add_argument("--budget", type=int, default=25)
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
    t.add_argument("--change-class", choices=("A", "B", "C"))
    t.add_argument("--changes", type=Path, help="JSONL with itemId, changeClass, before and after")
    t.add_argument("ids", nargs="+")
    t.set_defaults(func=cmd_pr_table)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
