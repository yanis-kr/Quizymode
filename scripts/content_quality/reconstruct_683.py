#!/usr/bin/env python3
"""Reconstruct #683 calibration labels from its item report and commit diff."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts/content_quality"))
from fetcher import load_tiers, tier_for_url  # noqa: E402
COMMIT = "0c7fbdb9"
ISSUE = "https://github.com/yanis-kr/Quizymode/issues/683"
UNVERIFIED = "1fc542a2-adaf-40b4-9271-56ee765d9c6d"
FIELDS = ("question", "correctAnswer", "incorrectAnswers", "explanation")


def git_text(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT).decode("utf-8", errors="replace")


def commit_items(ref: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    paths = git_text("ls-tree", "-r", "--name-only", ref, "data/seed-source/items/exams").splitlines()
    for path in paths:
        if "exams.aws.saa-c03." not in path or not path.endswith(".json"):
            continue
        rows = json.loads(git_text("show", f"{ref}:{path}"))
        for index, row in enumerate(rows):
            result[row["itemId"]] = {"item": row, "sourcePath": path, "sourceIndex": index}
    return result


def issue_findings() -> tuple[dict[str, str], dict[str, str], str]:
    comments = json.loads(subprocess.check_output(
        ["gh", "api", "repos/yanis-kr/Quizymode/issues/683/comments", "--paginate"], cwd=ROOT, text=True
    ))
    types: dict[str, str] = {}
    actions: dict[str, str] = {}
    for comment in comments:
        for match in re.finditer(r"\|\s*`([0-9a-f]{8})`\s*\|\s*(fix|remove)\s*\|\s*([a-z-]+)", comment["body"], re.I):
            types[match.group(1).lower()] = match.group(3).lower()
            actions[match.group(1).lower()] = match.group(2).lower()
    return types, actions, "github:yanis-kr/Quizymode#683"


def eligible_url(row: dict[str, Any]) -> str | None:
    raw = row["item"]
    candidates = [raw.get("source")]
    candidates.extend(check.get("source") for check in raw.get("factChecks", []) if isinstance(check, dict))
    candidates.extend(re.findall(r"https?://[^\s)\]>]+", raw.get("explanation", "")))
    tiers = load_tiers()
    for url in dict.fromkeys(value.rstrip(".,;") for value in candidates if isinstance(value, str)):
        if url.startswith(("https://", "http://")) and tier_for_url(url, tiers) == "T1":
            return url
    return None


def _strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [part for item in value for part in _strings(item)]
    return []


def _only_ligature_insertions(old: str, new: str) -> bool:
    i = j = 0
    while i < len(new):
        if j < len(old) and new[i] == old[j]:
            i += 1
            j += 1
        elif new[i:i + 2] in {"fi", "fl"}:
            i += 2
        else:
            return False
    return j == len(old)


def ligature_score(before: dict[str, Any], after: dict[str, Any]) -> int:
    """Count explicit fi/fl restorations even when the same item also has punctuation edits."""
    score = 0
    for field in FIELDS:
        old_parts, new_parts = _strings(before.get(field)), _strings(after.get(field))
        for old, new in zip(old_parts, new_parts):
            if old == new:
                continue
            # A local window handles extra punctuation or word-boundary edits while requiring
            # the corruption/restoration signature to occur in the same changed field.
            words_old, words_new = old.split(), new.split()
            for old_word, new_word in zip(words_old, words_new):
                if old_word != new_word and new_word.replace("fi", "").replace("fl", "") == old_word:
                    score += 1
    return score


def make_fixture(output: Path) -> dict[str, int]:
    before = commit_items(COMMIT + "^")
    after = commit_items(COMMIT)
    report_types, report_actions, source = issue_findings()
    ids_by_prefix: dict[str, list[str]] = {}
    for item_id in before:
        ids_by_prefix.setdefault(item_id[:8].lower(), []).append(item_id)
    reported = {item_id for prefix in report_types for item_id in ids_by_prefix.get(prefix, [])}
    wrong: set[str] = set()
    for item_id in reported:
        old = before[item_id]["item"]
        new = after.get(item_id, {}).get("item", {})
        if (
            report_types[item_id[:8].lower()] == "key"
            and report_actions[item_id[:8].lower()] == "fix"
            and old.get("correctAnswer") != new.get("correctAnswer")
            and not _only_ligature_insertions(old.get("correctAnswer", ""), new.get("correctAnswer", ""))
        ):
            wrong.add(item_id)
    if len(wrong) != 384:
        raise ValueError(f"expected 384 reported wrong keys, reconstructed {len(wrong)}: {sorted(wrong)}")

    residual = [item_id for item_id in before if item_id not in reported and item_id != UNVERIFIED]
    no_content_change = [item_id for item_id in residual if item_id in after and all(
        before[item_id]["item"].get(field) == after[item_id]["item"].get(field) for field in FIELDS
    )]
    changed = [item_id for item_id in residual if item_id in after and item_id not in no_content_change]
    exact_ligature = [item_id for item_id in changed if all(
        _only_ligature_insertions(a, b)
        for field in FIELDS
        for a, b in zip(_strings(before[item_id]["item"].get(field)), _strings(after[item_id]["item"].get(field)))
        if a != b
    )]
    other_changed = [item_id for item_id in changed if item_id not in exact_ligature]
    # #683 published only aggregate counts for this residual category. We use its 74-item
    # ligature-only total; exact text matches are classified first, then the strongest
    # fi/fl-restoration signatures. This makes the 157-item control set reproducible while
    # preserving the source's limitation that individual good-control IDs were not listed.
    ranked = sorted(other_changed, key=lambda item_id: (-ligature_score(before[item_id]["item"], after[item_id]["item"]), item_id))
    ligature = set(exact_ligature) | set(ranked[:max(0, 74 - len(exact_ligature))])
    controls = sorted(item_id for item_id in residual if item_id not in ligature)
    if len(controls) != 157 or len(ligature) != 74:
        raise ValueError(f"expected 157 controls and 74 ligature-only rows; got {len(controls)} and {len(ligature)}")

    labels: list[dict[str, Any]] = []
    fixture: list[dict[str, Any]] = []
    for item_id in sorted(wrong):
        old = before[item_id]
        labels.append({"itemId": item_id, "label": "historical-wrong-key", "expectedAnswer": old["item"]["correctAnswer"], "correctedAnswer": after[item_id]["item"]["correctAnswer"], "originCommit": COMMIT, "labelSource": source, "requiresQuote": True})
        fixture.append({"itemId": item_id, **old, "sourceUrl": eligible_url(after[item_id])})
    for item_id in controls:
        current = after.get(item_id, before[item_id])
        labels.append({"itemId": item_id, "label": "known-good", "expectedAnswer": current["item"]["correctAnswer"], "originCommit": COMMIT, "labelSource": source + "; residual-category reconstruction", "requiresQuote": True})
        fixture.append({"itemId": item_id, **current, "sourceUrl": eligible_url(current)})

    output.mkdir(parents=True, exist_ok=True)
    (output / "labels.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in labels), encoding="utf-8")
    (output / "items.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in fixture), encoding="utf-8")
    summary = {"historicalWrongKeys": len(wrong), "knownGood": len(controls), "ligatureRepairsExcluded": len(ligature), "unverifiedExcluded": 1, "sourceItems": len(before), "reportedFindings": len(reported), "originCommit": COMMIT, "controlDerivation": "Issue #683 per-item findings identify reported items; its 157 already-correct, 74 ligature-only, and one unverified items were aggregate-only. Residual controls are reconstructed by excluding the explicit unverified ID and 74 residual records, classifying exact fi/fl restorations first and ranking remaining restoration signatures, then retaining the remaining 157 IDs. The control IDs are therefore inferred, not individually published by #683."}
    (output / "fixture-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".cache/content-quality/727/calibration")
    args = parser.parse_args()
    print(json.dumps(make_fixture(args.output), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
