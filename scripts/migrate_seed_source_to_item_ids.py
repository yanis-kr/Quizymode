from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import sys
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from seed_source_common import (
    ALLOWLIST_PATH,
    DEV_SELECTION_PATH,
    REGISTRY_ROOT,
    ROOT,
    SOURCE_COLLECTIONS_ROOT,
    SOURCE_ITEMS_ROOT,
    normalize_question,
    write_json,
)


DEFAULT_AUDIT_DIR = Path(r"C:\Temp\quizymode-prod-audit\20260403-220047")
LEGACY_HOME_SAMPLE = ROOT / "data" / "seed-dev" / "sample-collections" / "home-sample.json"
LEGACY_SEED_DEV_ITEMS = ROOT / "data" / "seed-dev" / "items"

MANUAL_KEEPERS = {
    ("sports", "how long is a regulation nfl game?"): "data/seed-source/items/sports/sports.football.rules.json",
    ("sports", "how many innings are in a regulation mlb game?"): "data/seed-source/items/sports/sports.baseball.mlb.json",
    ("sports", "how many points is a goal worth in soccer?"): "data/seed-source/items/sports/sports.soccer.rules.json",
    ("sports", "which city hosted the 2012 summer olympics?"): "data/seed-source/items/sports/sports.olympics.hosts.json",
    ("sports", "which city hosted the 2016 summer olympics?"): "data/seed-source/items/sports/sports.olympics.hosts.json",
    ("sports", "which city hosted the 2022 winter olympics?"): "data/seed-source/items/sports/sports.olympics.hosts.json",
    ("sports", "which city hosted the 2024 summer olympics?"): "data/seed-source/items/sports/sports.olympics.hosts.json",
    ("sports", "which city will host the 2028 summer olympics?"): "data/seed-source/items/sports/sports.olympics.hosts.json",
    ("sports", "which franchise has won the most stanley cups?"): "data/seed-source/items/sports/sports.hockey.champions.json",
    ("sports", "which golfer won 18 men's major championships?"): "data/seed-source/items/sports/sports.champions.records.json",
    ("sports", "which team won the 2023 world series?"): "data/seed-source/items/sports/sports.baseball.champions.json",
}


@dataclass
class SnapshotRow:
    item_id: str
    seed_id: str | None
    category: str
    nav1: str
    nav2: str
    question: str
    created_at: datetime


@dataclass
class LegacyItem:
    path: Path
    index: int
    category: str
    nav1: str
    nav2: str
    question: str
    correct_answer: str
    incorrect_answers: list[str]
    explanation: str | None
    keywords: list[str] | None
    source: str | None
    seed_id: str | None
    item_id: str | None = None
    dropped: bool = False

    @property
    def key(self) -> tuple[str, str]:
        return self.category, normalize_question(self.question)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="One-time migration from legacy seedId source files to canonical itemId files.")
    parser.add_argument("--audit-dir", default=str(DEFAULT_AUDIT_DIR), help="Saved production audit folder containing Items.csv.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    audit_dir = Path(args.audit_dir)
    items_csv = audit_dir / "Items.csv"
    if not items_csv.exists():
        print(f"Missing snapshot Items.csv: {items_csv}", file=sys.stderr)
        return 1

    snapshot_rows = load_snapshot_rows(items_csv)
    legacy_items = load_legacy_source_items()
    assign_item_ids(legacy_items, snapshot_rows)
    resolve_manual_duplicate_drops(legacy_items)

    kept_items = [item for item in legacy_items if not item.dropped]
    allowlist_entries = build_allowlist_entries(kept_items)

    write_migrated_source_items(kept_items)
    write_json(ALLOWLIST_PATH, {"schemaVersion": 1, "allowedDuplicateQuestions": allowlist_entries})
    write_home_sample_collection(kept_items)
    write_seed_dev_selection(kept_items)

    legacy_sample_dir = ROOT / "data" / "seed-dev" / "sample-collections"
    if legacy_sample_dir.exists():
        shutil.rmtree(legacy_sample_dir)

    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_item_registry.py")], check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_seed_dev_subset.py")], check=True)

    print(f"Migrated {len(kept_items)} seed-source items to itemId.")
    print(f"Wrote allowlist entries: {len(allowlist_entries)}")
    return 0


def load_snapshot_rows(path: Path) -> list[SnapshotRow]:
    rows: list[SnapshotRow] = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            created_at = datetime.fromisoformat(raw["CreatedAt"].replace(" ", "T"))
            rows.append(
                SnapshotRow(
                    item_id=raw["Id"],
                    seed_id=raw["SeedId"] or None,
                    category=(raw["category"] if "category" in raw else "") or "",
                    nav1=(raw["nav1"] if "nav1" in raw else "") or "",
                    nav2=(raw["nav2"] if "nav2" in raw else "") or "",
                    question=raw["Question"],
                    created_at=created_at,
                )
            )

    rows.sort(key=lambda row: (row.created_at, row.item_id))
    return rows


def load_legacy_source_items() -> list[LegacyItem]:
    items: list[LegacyItem] = []
    for path in sorted(SOURCE_ITEMS_ROOT.rglob("*.json")):
        parts = path.stem.split(".")
        if len(parts) < 3:
            raise ValueError(f"Unsupported source filename: {path}")
        category = parts[0]
        nav1 = parts[1]
        nav2 = parts[2]

        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise ValueError(f"{path}: expected a JSON array.")

        for index, item in enumerate(raw):
            if not isinstance(item, dict):
                raise ValueError(f"{path} item {index}: expected an object.")

            items.append(
                LegacyItem(
                    path=path,
                    index=index,
                    category=str(item.get("category", category)).strip(),
                    nav1=str(item.get("navigationKeyword1", nav1)).strip(),
                    nav2=str(item.get("navigationKeyword2", nav2)).strip(),
                    question=str(item.get("question", "")).strip(),
                    correct_answer=str(item.get("correctAnswer", "")).strip(),
                    incorrect_answers=[str(value).strip() for value in item.get("incorrectAnswers", [])],
                    explanation=_optional_str(item.get("explanation")),
                    keywords=_optional_string_list(item.get("keywords")),
                    source=_optional_str(item.get("source")),
                    seed_id=_optional_str(item.get("seedId")),
                )
            )

    return items


def assign_item_ids(items: list[LegacyItem], snapshot_rows: list[SnapshotRow]) -> None:
    by_seed_id: dict[str, list[SnapshotRow]] = defaultdict(list)
    by_scope_question: dict[tuple[str, str, str, str], list[SnapshotRow]] = defaultdict(list)
    for row in snapshot_rows:
        if row.seed_id:
            by_seed_id[row.seed_id].append(row)
        by_scope_question[(row.category, row.nav1, row.nav2, normalize_question(row.question))].append(row)

    for item in items:
        chosen: SnapshotRow | None = None
        if item.seed_id and by_seed_id.get(item.seed_id):
            chosen = by_seed_id[item.seed_id][0]
        else:
            rows = by_scope_question.get((item.category, item.nav1, item.nav2, normalize_question(item.question)))
            if rows:
                chosen = rows[0]

        item.item_id = chosen.item_id if chosen else str(uuid.uuid4())


def resolve_manual_duplicate_drops(items: list[LegacyItem]) -> None:
    grouped: dict[tuple[str, str], list[LegacyItem]] = defaultdict(list)
    for item in items:
        grouped[item.key].append(item)

    for key, grouped_items in grouped.items():
        keeper_path = MANUAL_KEEPERS.get(key)
        if not keeper_path:
            continue

        keeper_rel = keeper_path.replace("\\", "/")
        for item in grouped_items:
            rel = item.path.relative_to(ROOT).as_posix()
            if rel != keeper_rel:
                item.dropped = True


def build_allowlist_entries(items: list[LegacyItem]) -> list[dict[str, str]]:
    grouped: dict[tuple[str, str], list[LegacyItem]] = defaultdict(list)
    for item in items:
        grouped[item.key].append(item)

    entries: list[dict[str, str]] = []
    for (category, _normalized_question), grouped_items in sorted(grouped.items()):
        if len(grouped_items) < 2:
            continue
        entries.append({"category": category, "question": grouped_items[0].question})
    return entries


def write_migrated_source_items(items: list[LegacyItem]) -> None:
    grouped: dict[Path, list[LegacyItem]] = defaultdict(list)
    for item in items:
        grouped[item.path].append(item)

    for path in sorted(SOURCE_ITEMS_ROOT.rglob("*.json")):
        grouped_items = grouped.get(path, [])
        payload = []
        for item in grouped_items:
            payload_item = {
                "itemId": item.item_id,
                "category": item.category,
                "navigationKeyword1": item.nav1,
                "navigationKeyword2": item.nav2,
                "question": item.question,
                "correctAnswer": item.correct_answer,
                "incorrectAnswers": item.incorrect_answers,
            }
            if item.explanation:
                payload_item["explanation"] = item.explanation
            if item.keywords:
                payload_item["keywords"] = item.keywords
            if item.source:
                payload_item["source"] = item.source
            payload.append(payload_item)

        write_json(path, payload)


def write_home_sample_collection(items: list[LegacyItem]) -> None:
    item_ids_by_seed_id = {item.seed_id: item.item_id for item in items if item.seed_id and item.item_id}
    item_ids_by_scope_question = {
        (item.category, item.nav1, item.nav2, normalize_question(item.question)): item.item_id
        for item in items
    }

    raw = json.loads(LEGACY_HOME_SAMPLE.read_text(encoding="utf-8"))
    resolved_item_ids: list[str] = []
    for seed_id in raw.get("itemSeedIds", []):
        item_id = item_ids_by_seed_id.get(seed_id)
        if item_id:
            resolved_item_ids.append(item_id)

    if len(resolved_item_ids) < len(raw.get("itemSeedIds", [])):
        for question in raw.get("itemQuestions", []):
            for item in items:
                if item.category == "trivia" and normalize_question(item.question) == normalize_question(question):
                    if item.item_id not in resolved_item_ids:
                        resolved_item_ids.append(item.item_id)
                    break

    payload = {
        "collectionId": raw["id"],
        "name": raw["name"],
        "description": raw["description"],
        "itemIds": resolved_item_ids,
    }
    write_json(SOURCE_COLLECTIONS_ROOT / "home-sample.json", payload)


def write_seed_dev_selection(items: list[LegacyItem]) -> None:
    seed_lookup = {item.seed_id: item.item_id for item in items if item.seed_id and item.item_id}
    scope_lookup = {
        (item.category, item.nav1, item.nav2, normalize_question(item.question)): item.item_id
        for item in items
    }

    selected_item_ids: list[str] = []
    for path in sorted(LEGACY_SEED_DEV_ITEMS.rglob("*.json")):
        parts = path.stem.split(".")
        if len(parts) < 3:
            continue
        raw = json.loads(path.read_text(encoding="utf-8"))
        for item in raw:
            seed_id = _optional_str(item.get("seedId"))
            item_id = seed_lookup.get(seed_id) if seed_id else None
            if item_id is None:
                item_id = scope_lookup.get(
                    (
                        str(item.get("category", parts[0])).strip(),
                        str(item.get("navigationKeyword1", parts[1])).strip(),
                        str(item.get("navigationKeyword2", parts[2])).strip(),
                        normalize_question(str(item.get("question", "")).strip()),
                    )
                )
            if item_id and item_id not in selected_item_ids:
                selected_item_ids.append(item_id)

    home_collection = json.loads((SOURCE_COLLECTIONS_ROOT / "home-sample.json").read_text(encoding="utf-8"))
    payload = {
        "schemaVersion": 1,
        "itemIds": selected_item_ids,
        "collectionIds": [home_collection["collectionId"]],
    }
    write_json(DEV_SELECTION_PATH, payload)


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_string_list(value: object) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list):
        return None
    result = [str(item).strip() for item in value if str(item).strip()]
    return result or None


if __name__ == "__main__":
    raise SystemExit(main())
