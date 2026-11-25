#!/usr/bin/env python3
"""Source expansion for calibration evidence gaps (#727, rubric 2 follow-up).

L2 ends as `evidence-gap` when the one cached page for an item does not cover the question. This tool finds more eligible
pages without looking at labels or the stored key:

  suggest  blind model call (level S, question and options only) proposes up to 3 official documentation URLs per gap item.
  fetch    keeps only URLs of the exam profile's minimum tier, fetches them politely into the git-ignored cache.
  report   counts how many gap items now have an extra cached page.

The result is `extra-sources.json` (itemId -> [urls]) next to the calibration items. `calibration_cli.py run-fixture`
then picks, per item, the cached page whose best passage overlaps the question and options most, and reruns only gap items
whose chosen page changed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fetcher import fetch_run, load_profiles, load_tiers, tier_for_url  # noqa: E402
from fixture_tools import source_item  # noqa: E402
from model_review import DEFAULT_MODELS, MAX_BATCH, read_jsonl, run_packets  # noqa: E402
from quality_lib import RUBRIC_VERSION, cache_is_ok, packet, read_cache  # noqa: E402

MAX_URLS = 3
GAP_VERDICTS = {"evidence-gap"}


def gap_item_ids(results_path: Path, all_ids: set[str] | None = None) -> list[str]:
    """Items whose latest L2 result is an evidence gap (last row per item wins), plus items with no L2 result at all."""
    latest: dict[str, dict] = {}
    for row in read_jsonl(results_path):
        latest[str(row.get("itemId"))] = row
    gaps = {item_id for item_id, row in latest.items() if row.get("verdict") in GAP_VERDICTS}
    return sorted(gaps | ((all_ids or set()) - set(latest)))


def eligible_urls(urls: list[str], minimum_tier: str, tiers: dict) -> list[str]:
    order = {f"T{n}": n for n in range(1, 6)}
    keep: list[str] = []
    for url in urls:
        if not isinstance(url, str) or not url.startswith("https://") or url in keep:
            continue
        if order.get(tier_for_url(url, tiers), 99) <= order.get(minimum_tier, 5):
            keep.append(url)
    return keep[:MAX_URLS]


def cmd_suggest(args: argparse.Namespace) -> int:
    items = {row["itemId"]: source_item(row) for row in read_jsonl(args.items)}
    wanted = [i for i in gap_item_ids(args.results, set(items)) if i in items]
    tried: dict[str, list[str]] = {}
    for row in read_jsonl(args.items):
        tried.setdefault(row["itemId"], [])
        if row.get("sourceUrl"):
            tried[row["itemId"]].append(row["sourceUrl"])
    extra_path = args.items.with_name("extra-sources.json")
    for item_id, urls in (json.loads(extra_path.read_text(encoding="utf-8")) if extra_path.exists() else {}).items():
        tried.setdefault(item_id, []).extend(urls)
    if args.only:
        wanted = [i for i in args.only.split(",") if i in items]
    done = {str(r.get("itemId")) for r in read_jsonl(args.output)} if args.output.exists() else set()
    todo = [i for i in wanted if i not in done][: args.budget]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    model = args.model or DEFAULT_MODELS["L1"]
    started = 0
    for start in range(0, len(todo), MAX_BATCH):
        batch = todo[start:start + MAX_BATCH]
        packets = []
        for item_id in batch:
            body = packet(items[item_id], "L1", args.seed)
            body["level"] = "S"
            if tried.get(item_id) and args.round > 1:
                body["triedUrls"] = sorted(set(tried[item_id]))
            packets.append(body)
        results = run_packets("S", packets, model, MAX_BATCH)
        with args.output.open("a", encoding="utf-8", newline="\n") as stream:
            for row in results:
                stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        started += len(batch)
        print(json.dumps({"suggested": started, "of": len(todo)}), flush=True)
    print(json.dumps({"gapItems": len(wanted), "alreadySuggested": len(done), "suggestedNow": started}))
    return 0


def cmd_fetch(args: argparse.Namespace) -> int:
    tiers, profiles = load_tiers(), load_profiles()
    minimum = profiles.get("exams", profiles.get("default", {})).get("minTier", "T1")
    suggestions = {str(r["itemId"]): r.get("urls") or [] for r in read_jsonl(args.suggestions)}
    extra = {item_id: eligible_urls(urls, minimum, tiers) for item_id, urls in suggestions.items()}
    extra = {item_id: urls for item_id, urls in extra.items() if urls}
    urls = sorted({u for urls in extra.values() for u in urls})
    summary = fetch_run(urls, base_delay=args.delay)
    print(json.dumps(summary.as_dict(), sort_keys=True))
    usable = {item_id: [u for u in urls if cache_is_ok(read_cache(u))] for item_id, urls in extra.items()}
    usable = {item_id: urls for item_id, urls in usable.items() if urls}
    args.output.write_text(json.dumps(usable, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"itemsWithSuggestions": len(extra), "itemsWithCachedExtra": len(usable), "urlsFetched": len(urls), "rubric": RUBRIC_VERSION}))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    suggest = sub.add_parser("suggest")
    suggest.add_argument("--items", type=Path, required=True)
    suggest.add_argument("--results", type=Path, required=True, help="L2 results JSONL")
    suggest.add_argument("--output", type=Path, required=True)
    suggest.add_argument("--budget", type=int, default=400)
    suggest.add_argument("--seed", default="727")
    suggest.add_argument("--only", help="comma-separated item ids to suggest for, instead of every gap item")
    suggest.add_argument("--round", type=int, default=1, help="2 and up: send already-tried URLs so the model proposes different pages")
    suggest.add_argument("--model")
    suggest.set_defaults(func=cmd_suggest)
    fetch = sub.add_parser("fetch")
    fetch.add_argument("--suggestions", type=Path, required=True)
    fetch.add_argument("--output", type=Path, required=True)
    fetch.add_argument("--delay", type=float, default=1.0)
    fetch.set_defaults(func=cmd_fetch)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
