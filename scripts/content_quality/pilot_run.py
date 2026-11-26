#!/usr/bin/env python3
"""One budgeted pilot batch at L2 for exam items without an eligible cached source (#727).

  python scripts/content_quality/pilot_run.py --item-ids <file> [--seed 727] [--rounds 2] [--delay 1.0]

For each listed item: use its own eligible cited source when it is cached; otherwise a blind level-S call (question and
options only, no key) proposes official documentation pages, only pages of the exam profile's minimum tier are fetched, and
the cached page whose best passage overlaps the question and options most is used. L2 then reviews every item that has a
page; items without one stay unverified and are listed as source gaps. Verdicts go through the same `ingest` as
`cli.py ingest` (quote and tier checks included) into the category ledger. Nothing here writes item files.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fetcher import fetch_run, load_profiles, load_tiers  # noqa: E402
from model_review import DEFAULT_MODELS, MAX_BATCH, run_packets  # noqa: E402
from normalize_reviews import normalize  # noqa: E402
from quality_lib import (  # noqa: E402
    append_rows,
    best_passage_scored,
    cache_is_ok,
    eligible_source_url,
    ingest,
    ledger_path,
    packet,
    read_cache,
)
from seed_source_common import load_source_items  # noqa: E402
from source_expansion import eligible_urls  # noqa: E402


def choose_page(item, candidates: list[str]) -> str | None:
    """The cached candidate whose best passage overlaps the question and every option most (first wins ties)."""
    best_url, best_score = None, -1
    for url in candidates:
        cached = read_cache(url)
        if not cache_is_ok(cached):
            continue
        score, _ = best_passage_scored(cached.get("text", ""), item)
        if score > best_score:
            best_url, best_score = url, score
    return best_url


def fetch_own_sources(items: list, tiers: dict, minimum_tier: str, delay: float) -> list[str]:
    """Fetch each item's own eligible cited page when it is not cached yet, so a cited page is never skipped for a guess."""
    urls = sorted({u for u in (eligible_source_url(i, tiers, minimum_tier) for i in items) if u and read_cache(u) is None})
    if urls:
        fetch_run(urls, base_delay=delay)
    return urls


def ledger_pages(category: str) -> dict[str, list[str]]:
    """itemId -> every source URL an earlier L2 row of the category ledger used (the pages already tried)."""
    pages: dict[str, list[str]] = {}
    path = ledger_path(category)
    for line in path.read_text(encoding="utf-8").splitlines() if path.exists() else []:
        row = json.loads(line)
        if row.get("level") == "L2" and row.get("sourceUrl"):
            pages.setdefault(str(row["itemId"]), []).append(row["sourceUrl"])
    return pages


def suggest(items: list, tried: dict[str, list[str]], seed: str, model: str, minimum_tier: str, tiers: dict, delay: float) -> dict[str, list[str]]:
    """Blind source-finder calls (level S) for the given items; returns itemId -> eligible URLs now in the cache."""
    found: dict[str, list[str]] = {}
    for start in range(0, len(items), MAX_BATCH):
        packets = []
        for item in items[start:start + MAX_BATCH]:
            body = packet(item, "L1", seed)
            body["level"] = "S"
            if tried.get(item.item_id):
                body["triedUrls"] = sorted(set(tried[item.item_id]))
            packets.append(body)
        for row in run_packets("S", packets, model, MAX_BATCH):
            found[str(row["itemId"])] = eligible_urls(row.get("urls") or [], minimum_tier, tiers)
    urls = sorted({u for urls in found.values() for u in urls})
    if urls:
        fetch_run(urls, base_delay=delay)
    return {i: [u for u in us if cache_is_ok(read_cache(u))] for i, us in found.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--item-ids", type=Path, required=True)
    parser.add_argument("--category", default="exams")
    parser.add_argument("--seed", default="727")
    parser.add_argument("--rounds", type=int, default=2)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--retry-gaps", action="store_true", help="look for a DIFFERENT page than the ones earlier L2 rows used (source-finder rounds get the tried URLs from the first call)")
    parser.add_argument("--summary", type=Path, help="write the run summary JSON here")
    args = parser.parse_args()
    wanted = [line.strip() for line in args.item_ids.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(wanted) > MAX_BATCH:
        raise SystemExit(f"a pilot batch is at most {MAX_BATCH} items; got {len(wanted)}")
    items_by_id = {i.item_id: i for i in load_source_items() if i.category == args.category}
    items = [items_by_id[i] for i in wanted if i in items_by_id]
    tiers, profiles = load_tiers(), load_profiles()
    minimum = profiles.get(args.category, profiles["default"]).get("minTier", "T1")
    chosen: dict[str, str | None] = {}
    tried: dict[str, list[str]] = {}
    fetch_own_sources(items, tiers, minimum, args.delay)
    earlier = ledger_pages(args.category) if args.retry_gaps else {}
    for item in items:
        own = eligible_source_url(item, tiers, minimum)
        tried[item.item_id] = ([own] if own else []) + earlier.get(item.item_id, [])
        chosen[item.item_id] = None if args.retry_gaps else (own if own and cache_is_ok(read_cache(own)) else None)
    for round_number in range(1, args.rounds + 1):
        todo = [i for i in items if chosen[i.item_id] is None]
        if not todo:
            break
        found = suggest(todo, tried if round_number > 1 or args.retry_gaps else {}, args.seed, DEFAULT_MODELS["L1"], minimum, tiers, args.delay)
        for item in todo:
            urls = [u for u in found.get(item.item_id, []) if not args.retry_gaps or u not in tried[item.item_id]]
            tried[item.item_id].extend(urls)
            chosen[item.item_id] = choose_page(item, urls)
    packets = [packet(i, "L2", args.seed, source_url=chosen[i.item_id]) for i in items if chosen[i.item_id]]
    gaps = [i.item_id for i in items if not chosen[i.item_id]]
    accepted_n = 0
    rejected: list[str] = []
    if packets:
        results = run_packets("L2", packets, DEFAULT_MODELS["L2"], MAX_BATCH)
        verdicts = normalize(packets, results, items_by_id)
        accepted, rejected = ingest(verdicts, items_by_id)
        by_category: dict[str, list[dict]] = {}
        for row in accepted:
            by_category.setdefault(items_by_id[row["itemId"]].category, []).append(row)
        for category, rows in by_category.items():
            append_rows(ledger_path(category), rows)
        accepted_n = len(accepted)
    summary = {
        "at": datetime.now(timezone.utc).isoformat(),
        "items": len(items), "withSource": len(packets), "sourceGaps": gaps, "accepted": accepted_n, "rejected": rejected,
        "models": {"L2": DEFAULT_MODELS["L2"], "S": DEFAULT_MODELS["L1"]},
    }
    if args.summary:
        args.summary.write_text(json.dumps(summary, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({k: (v if k != "rejected" else len(v)) for k, v in summary.items()}))
    return 1 if rejected else 0


if __name__ == "__main__":
    raise SystemExit(main())
