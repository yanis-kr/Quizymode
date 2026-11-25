#!/usr/bin/env python3
"""Choose and materialize source-verified non-AWS seeded calibration errors."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts/content_quality"))
from fetcher import load_profiles, load_tiers  # noqa: E402
from quality_lib import eligible_source_url, read_cache, verify_quote  # noqa: E402
from seed_source_common import load_source_items  # noqa: E402


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows), encoding="utf-8")


def candidates(limit: int, output: Path) -> int:
    tiers, profiles = load_tiers(), load_profiles()
    selected = []
    for item in load_source_items():
        if item.category != "exams" or "aws" in (item.navigation_keyword1 + " " + item.navigation_keyword2).lower():
            continue
        url = eligible_source_url(item, tiers, profiles.get(item.category, profiles["default"]).get("minTier", "T5"))
        if not url:
            continue
        raw_items = json.loads(item.path.read_text(encoding="utf-8"))
        selected.append({
            "itemId": item.item_id,
            "item": raw_items[item.index],
            "sourcePath": str(item.path),
            "sourceIndex": item.index,
            "sourceUrl": url,
        })
    selected.sort(key=lambda row: hashlib.sha256(str(row["itemId"]).encode("utf-8")).hexdigest())
    write_jsonl(output, selected[:limit])
    print(json.dumps({"eligibleCandidates": len(selected), "written": min(limit, len(selected)), "output": str(output)}, sort_keys=True))
    return 0


def materialize(items_path: Path, reviews_path: Path, output: Path, labels_path: Path, limit: int) -> int:
    items = [json.loads(line) for line in items_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    reviews = {str(row["itemId"]): row for row in (json.loads(line) for line in reviews_path.read_text(encoding="utf-8").splitlines() if line.strip())}
    verified = []
    for row in items:
        review = reviews.get(str(row["itemId"]))
        if review is None or review.get("verdict") != "source-verified" or not review.get("quote"):
            continue
        cached = read_cache(row.get("sourceUrl") or "")
        if cached and verify_quote(review["quote"], cached.get("text", "")):
            verified.append((row, review))
    verified.sort(key=lambda pair: hashlib.sha256(str(pair[0]["itemId"]).encode("utf-8")).hexdigest())
    chosen = verified[:limit]
    seeded_items: list[dict[str, Any]] = []
    labels: list[dict[str, Any]] = []
    for row, review in chosen:
        raw = dict(row["item"])
        key = str(raw["correctAnswer"])
        distractors = list(raw.get("incorrectAnswers", []))
        if len(distractors) < 2:
            continue
        wrong = distractors[0]
        raw["correctAnswer"] = wrong
        raw["incorrectAnswers"] = [key, *distractors[1:]]
        seeded_items.append({**row, "item": raw, "seededAnswer": wrong})
        labels.append({
            "itemId": row["itemId"],
            "label": "seeded-wrong-key",
            "expectedAnswer": key,
            "seededAnswer": wrong,
            "originCommit": "working tree at fixture build",
            "labelSource": "independent L2 source-verified result and cached quote",
            "baselineCallId": review.get("callId"),
            "requiresQuote": True,
        })
    write_jsonl(output, seeded_items)
    write_jsonl(labels_path, labels)
    print(json.dumps({"verifiedCandidates": len(verified), "written": len(seeded_items), "requested": limit, "output": str(output)}, sort_keys=True))
    return 0 if len(seeded_items) == limit else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    pick = sub.add_parser("candidates")
    pick.add_argument("--limit", type=int, default=75)
    pick.add_argument("--output", type=Path, required=True)
    pick.set_defaults(func=lambda args: candidates(args.limit, args.output))
    seed = sub.add_parser("materialize")
    seed.add_argument("--items", type=Path, required=True)
    seed.add_argument("--reviews", type=Path, required=True)
    seed.add_argument("--output", type=Path, required=True)
    seed.add_argument("--labels", type=Path, required=True)
    seed.add_argument("--limit", type=int, default=50)
    seed.set_defaults(func=lambda args: materialize(args.items, args.reviews, args.output, args.labels, args.limit))
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
