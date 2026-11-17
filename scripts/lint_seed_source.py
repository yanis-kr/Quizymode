#!/usr/bin/env python3
"""Deterministic seed-source lint (#725).

Hard rules fail on any changed item. Soft rules are compared with a committed baseline, so an
untouched item with a known soft violation does not fail CI. Near-duplicate pairs are reported only.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Callable, Iterable

from seed_source_common import REGISTRY_ROOT, ROOT, SourceItem, load_source_items

QUALITY_ROOT = REGISTRY_ROOT / "quality"
PROFILES_PATH = QUALITY_ROOT / "profiles.json"
BASELINE_PATH = QUALITY_ROOT / "soft-baseline.json"
ITEMS_PREFIX = "data/seed-source/items/"

UPD_PATTERN = re.compile(r"UPD\d{6}")
PLACEHOLDER = "best-matching choice"
ABSOLUTE_OPTIONS = ("all of the above", "none of the above")
NEAR_DUPLICATE_THRESHOLD = 0.8
ECHO_PREFIX_LENGTH = 60
DEFAULT_PROFILE = {"longestMargin": 15, "minExplanation": 25}


def norm(text: str) -> str:
    return " ".join(text.lower().split())


def load_profiles(path: Path = PROFILES_PATH) -> dict[str, dict[str, int]]:
    return json.loads(path.read_text(encoding="utf-8"))


def profile_for(item: SourceItem, profiles: dict[str, dict[str, int]]) -> dict[str, int]:
    return profiles.get(item.category, profiles.get("default", DEFAULT_PROFILE))


def hard_violations(item: SourceItem) -> list[str]:
    options = [item.correct_answer, *item.incorrect_answers]
    texts = [t for t in [item.question, *options, item.explanation or ""] if t]
    rules: list[str] = []

    normalized_options = [norm(o) for o in options if o]
    if len(set(normalized_options)) != len(normalized_options):
        rules.append("H1-duplicate-option")

    explanation = norm(item.explanation or "")
    if explanation and (
        explanation == norm(item.correct_answer)
        or explanation.startswith(norm(item.question)[:ECHO_PREFIX_LENGTH])
    ):
        rules.append("H2-explanation-echo")

    if any(PLACEHOLDER in norm(t) for t in texts):
        rules.append("H3-placeholder")

    if any(UPD_PATTERN.search(t) for t in texts):
        rules.append("H4-upd-marker")
    return rules


def soft_violations(item: SourceItem, profiles: dict[str, dict[str, int]]) -> list[str]:
    profile = profile_for(item, profiles)
    rules: list[str] = []
    distractors = [d for d in item.incorrect_answers if d]

    if distractors and len(item.correct_answer) >= max(len(d) for d in distractors) + profile["longestMargin"]:
        rules.append("S1-key-longest")

    if any(norm(o) in ABSOLUTE_OPTIONS for o in [item.correct_answer, *item.incorrect_answers]):
        rules.append("S2-absolute-option")

    if item.explanation is not None and len(item.explanation) < profile["minExplanation"]:
        rules.append("S3-short-explanation")

    if norm(item.correct_answer) and norm(item.correct_answer) in norm(item.question):
        rules.append("S4-key-in-stem")
    return rules


def violation_key(item: SourceItem, rule: str) -> str:
    return f"{item.item_id}|{rule}"


def near_duplicates(items: Iterable[SourceItem]) -> list[dict[str, object]]:
    by_category: dict[str, list[tuple[SourceItem, frozenset[str]]]] = {}
    for item in items:
        tokens = frozenset(w for w in re.findall(r"[a-z0-9]+", norm(item.question)) if len(w) > 2)
        if tokens:
            by_category.setdefault(item.category, []).append((item, tokens))

    pairs: list[dict[str, object]] = []
    for group in by_category.values():
        for i, (a, ta) in enumerate(group):
            for b, tb in group[i + 1:]:
                union = len(ta | tb)
                similarity = len(ta & tb) / union if union else 0.0
                if similarity >= NEAR_DUPLICATE_THRESHOLD:
                    pairs.append({"a": a.item_id, "b": b.item_id, "similarity": round(similarity, 3)})
    pairs.sort(key=lambda p: -float(p["similarity"]))  # type: ignore[arg-type]
    return pairs[:200]


def changed_item_paths(base: str) -> set[str] | None:
    try:
        output = subprocess.run(
            ["git", "diff", "--name-only", f"{base}...HEAD", "--", ITEMS_PREFIX],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    return {line.strip() for line in output.splitlines() if line.strip()}


def item_relative_path(item: SourceItem) -> str:
    return item.path.resolve().relative_to(ROOT).as_posix()


def raw_items_by_id(text: str) -> dict[str, str]:
    """itemId -> canonical JSON of the raw item, so an edit can be told apart from an untouched neighbour."""
    return {
        str(raw.get("itemId", "")).strip(): json.dumps(raw, sort_keys=True, ensure_ascii=False)
        for raw in json.loads(text)
    }


def git_show(base: str, rel: str) -> str | None:
    try:
        return subprocess.run(
            ["git", "show", f"{base}:{rel}"], cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def select_changed_items(
    items: list[SourceItem],
    changed_paths: set[str],
    base_text: "Callable[[str], str | None]",
    head_text: "Callable[[str], str]",
) -> list[SourceItem]:
    """Items in a changed file whose content differs from the base, or that are new. Untouched items are skipped."""
    base_maps: dict[str, dict[str, str]] = {}
    head_maps: dict[str, dict[str, str]] = {}
    selected: list[SourceItem] = []
    for item in items:
        rel = item_relative_path(item)
        if rel not in changed_paths:
            continue
        if rel not in head_maps:
            head_maps[rel] = raw_items_by_id(head_text(rel))
            base = base_text(rel)
            base_maps[rel] = raw_items_by_id(base) if base else {}
        if base_maps[rel].get(item.item_id) != head_maps[rel].get(item.item_id):
            selected.append(item)
    return selected


def run(args: argparse.Namespace) -> int:
    started = time.monotonic()
    items = load_source_items()
    profiles = load_profiles()

    current_soft = {violation_key(i, r) for i in items for r in soft_violations(i, profiles)}
    baseline = set(json.loads(BASELINE_PATH.read_text(encoding="utf-8"))) if BASELINE_PATH.exists() else set()

    if args.update_baseline:
        grown = current_soft - baseline
        if grown and not args.allow_growth:
            print(f"Refusing to grow the baseline by {len(grown)} entries; pass --allow-growth.", file=sys.stderr)
            return 2
        BASELINE_PATH.write_text(json.dumps(sorted(current_soft), indent=1) + "\n", encoding="utf-8")
        print(f"Baseline written: {len(current_soft)} soft violations.")
        return 0

    checked = items
    if args.changed_only:
        changed = changed_item_paths(args.base)
        if changed is None:
            print(f"WARNING: git diff against {args.base} failed; checking every item.", file=sys.stderr)
        else:
            checked = select_changed_items(
                items,
                changed,
                lambda rel: git_show(args.base, rel),
                lambda rel: (ROOT / rel).read_text(encoding="utf-8"),
            )

    hard = [(i, r) for i in checked for r in hard_violations(i)]
    soft_new = [
        (i, r) for i in checked for r in soft_violations(i, profiles)
        if violation_key(i, r) not in baseline
    ]

    counts = Counter(r for _, r in hard + soft_new)
    report = {
        "items": len(items),
        "checked": len(checked),
        "perRule": dict(sorted(counts.items())),
        "hard": [{"itemId": i.item_id, "rule": r} for i, r in hard],
        "softNew": [{"itemId": i.item_id, "rule": r} for i, r in soft_new],
        "nearDuplicates": [] if args.changed_only else near_duplicates(items),
        "runtimeSeconds": round(time.monotonic() - started, 2),
    }

    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in ("hard", "softNew", "nearDuplicates")}, indent=1))

    if not args.changed_only:
        # Full-catalog mode is a report: existing content may already break a rule (see the baseline).
        return 0

    for i, r in hard:
        print(f"ERROR {i.item_id} {r}", file=sys.stderr)
    for i, r in soft_new:
        print(f"ERROR {i.item_id} {r} (soft, not in baseline)", file=sys.stderr)
    return 1 if hard or soft_new else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="origin/main", help="base ref for --changed-only")
    parser.add_argument("--changed-only", action="store_true", help="check only items changed since --base")
    parser.add_argument("--update-baseline", action="store_true", help="rewrite the soft baseline (shrinks only)")
    parser.add_argument("--allow-growth", action="store_true", help="let --update-baseline add entries")
    parser.add_argument("--report", help="write the full JSON report to this path")
    return run(parser.parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
