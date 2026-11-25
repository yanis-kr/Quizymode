#!/usr/bin/env python3
"""Committed calibration fixture for #727: export, validation and deterministic rebuild.

The fixture holds labels only (item id, label, origin commit, expected answer, content hash, eligible source URL).
Reviewer packets are built from the rebuilt items and never carry a label or an expected answer.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts/content_quality"))
from quality_lib import QUALITY_ROOT, content_hash  # noqa: E402
from seed_source_common import SourceItem  # noqa: E402

FIXTURE_PATH = QUALITY_ROOT / "calibration-fixture.jsonl"
SUMMARY_PATH = QUALITY_ROOT / "calibration-fixture-summary.json"
LABELS = ("historical-wrong-key", "known-good", "seeded-wrong-key")
EXPECTED_COUNTS = {"historical-wrong-key": 384, "known-good": 157, "seeded-wrong-key": 50}
REQUIRED_FIELDS = ("itemId", "label", "originCommit", "labelSource", "expectedAnswer", "contentHash", "requiresQuote")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows), encoding="utf-8", newline="\n")


def source_item(row: dict[str, Any]) -> SourceItem:
    """Build a SourceItem from a fixture item row ({itemId, item, sourcePath, sourceIndex})."""
    raw = row["item"]
    return SourceItem(
        item_id=str(row["itemId"]),
        category=str(raw.get("category", "exams")),
        navigation_keyword1=str(raw.get("navigationKeyword1", "exams")),
        navigation_keyword2=str(raw.get("navigationKeyword2", "calibration")),
        question=str(raw["question"]),
        correct_answer=str(raw["correctAnswer"]),
        incorrect_answers=list(raw.get("incorrectAnswers", [])),
        explanation=raw.get("explanation"),
        keywords=raw.get("keywords", []),
        source=raw.get("source"),
        path=Path(row.get("sourcePath", "calibration-fixture.json")),
        index=int(row.get("sourceIndex", 0)),
    )


def validate_fixture(rows: list[dict[str, Any]], expected: dict[str, int] | None = None) -> dict[str, Any]:
    """Check fixture integrity and return counts by label and origin commit. Raises ValueError on a defect."""
    expected = EXPECTED_COUNTS if expected is None else expected
    ids = [str(row.get("itemId")) for row in rows]
    if len(set(ids)) != len(ids):
        raise ValueError("fixture itemId values must be unique")
    for row in rows:
        missing = [field for field in REQUIRED_FIELDS if row.get(field) in (None, "")]
        if missing:
            raise ValueError(f"{row.get('itemId')}: missing fixture fields {missing}")
        if row["label"] not in LABELS:
            raise ValueError(f"{row['itemId']}: unknown label {row['label']}")
        if row["label"] == "seeded-wrong-key" and (not row.get("seededAnswer") or row["seededAnswer"] == row["expectedAnswer"]):
            raise ValueError(f"{row['itemId']}: seeded row needs a seededAnswer different from the expected answer")
    by_label = Counter(row["label"] for row in rows)
    for label, count in expected.items():
        if by_label[label] != count:
            raise ValueError(f"expected {count} {label} rows, found {by_label[label]}")
    return {
        "counts": dict(sorted(by_label.items())),
        "total": len(rows),
        "originCommits": dict(sorted(Counter(str(row["originCommit"]) for row in rows).items())),
    }


def export_fixture(labels_path: Path, items_path: Path, seeded_items_path: Path | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Join working labels with their item rows to add contentHash and sourceUrl."""
    item_rows = {str(row["itemId"]): row for row in read_jsonl(items_path)}
    if seeded_items_path:
        item_rows.update({str(row["itemId"]): row for row in read_jsonl(seeded_items_path)})
    fixture: list[dict[str, Any]] = []
    for label in read_jsonl(labels_path):
        row = item_rows[str(label["itemId"])]
        entry = {key: value for key, value in label.items() if key != "baselineCallId"}
        entry["contentHash"] = content_hash(source_item(row))
        entry["sourceUrl"] = row.get("sourceUrl")
        fixture.append(entry)
    fixture.sort(key=lambda row: (row["label"], row["itemId"]))
    return fixture, validate_fixture(fixture)


def _git_text(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT).decode("utf-8", errors="replace")


def _items_at(ref: str, wanted: set[str], prefix: str) -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for path in _git_text("ls-tree", "-r", "--name-only", ref, prefix).splitlines():
        if not path.endswith(".json"):
            continue
        for index, raw in enumerate(json.loads(_git_text("show", f"{ref}:{path}"))):
            if raw.get("itemId") in wanted:
                found[raw["itemId"]] = {"itemId": raw["itemId"], "item": raw, "sourcePath": path, "sourceIndex": index}
    return found


def rebuild_items(fixture: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    """Rebuild reviewer items from git history. Returns (item rows, hash mismatch messages).

    Historical wrong keys use the version before the origin commit, known-good controls use the version at it,
    and seeded rows take the item at their origin commit with the recorded distractor swapped into the key.
    """
    prefix = "data/seed-source/items/exams"
    rows: list[dict[str, Any]] = []
    problems: list[str] = []
    for label in LABELS:
        group = [row for row in fixture if row["label"] == label]
        if not group:
            continue
        wanted = {row["itemId"] for row in group}
        commits = sorted({row["originCommit"] for row in group})
        if len(commits) != 1:
            raise ValueError("one origin commit per label is expected")
        ref = f"{commits[0]}^" if label == "historical-wrong-key" else commits[0]
        found = _items_at(ref, wanted, prefix)
        for entry in group:
            built = found.get(entry["itemId"])
            if built is None:
                problems.append(f"{entry['itemId']}: not found for {label}")
                continue
            built = json.loads(json.dumps(built))
            if label == "seeded-wrong-key":
                raw = built["item"]
                distractors = list(raw["incorrectAnswers"])
                if entry["seededAnswer"] not in distractors:
                    problems.append(f"{entry['itemId']}: seeded answer is no longer a distractor")
                    continue
                key = raw["correctAnswer"]
                distractors[distractors.index(entry["seededAnswer"])] = key
                raw["correctAnswer"] = entry["seededAnswer"]
                raw["incorrectAnswers"] = distractors
            built["sourceUrl"] = entry.get("sourceUrl")
            if content_hash(source_item(built)) != entry["contentHash"]:
                problems.append(f"{entry['itemId']}: content hash differs from the committed fixture")
            rows.append(built)
    return rows, problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    export = sub.add_parser("export", help="write the committed fixture from working labels and items")
    export.add_argument("--labels", type=Path, required=True)
    export.add_argument("--items", type=Path, required=True)
    export.add_argument("--seeded-items", type=Path)
    export.add_argument("--output", type=Path, default=FIXTURE_PATH)
    export.add_argument("--summary", type=Path, default=SUMMARY_PATH)
    check = sub.add_parser("check", help="validate the committed fixture counts and fields")
    check.add_argument("--fixture", type=Path, default=FIXTURE_PATH)
    rebuild = sub.add_parser("rebuild", help="rebuild reviewer item rows from git history and verify content hashes")
    rebuild.add_argument("--fixture", type=Path, default=FIXTURE_PATH)
    rebuild.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "export":
        fixture, summary = export_fixture(args.labels, args.items, args.seeded_items)
        write_jsonl(args.output, fixture)
        args.summary.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
        print(json.dumps(summary, sort_keys=True))
        return 0
    fixture = read_jsonl(args.fixture)
    summary = validate_fixture(fixture)
    if args.command == "check":
        print(json.dumps(summary, sort_keys=True))
        return 0
    rows, problems = rebuild_items(fixture)
    write_jsonl(args.output, rows)
    print(json.dumps({"rebuilt": len(rows), "problems": problems[:20], "problemCount": len(problems)}, sort_keys=True))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
