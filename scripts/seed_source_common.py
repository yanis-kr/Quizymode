from __future__ import annotations

import csv
import json
import re
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ITEMS_ROOT = ROOT / "data" / "seed-source" / "items"
SOURCE_COLLECTIONS_ROOT = ROOT / "data" / "seed-source" / "collections" / "public"
REGISTRY_ROOT = ROOT / "data" / "seed-source" / "_registry"
ALLOWLIST_PATH = REGISTRY_ROOT / "duplicate-question-allowlist.json"
DEV_SELECTION_PATH = ROOT / "data" / "seed-dev" / "selection.json"
SEED_DEV_ITEMS_ROOT = ROOT / "data" / "seed-dev" / "items"
SEED_DEV_COLLECTIONS_ROOT = ROOT / "data" / "seed-dev" / "collections"
GENERATED_BUNDLE_PATH = ROOT / "data" / "generated" / "core-public-items.admin-sync.json"


@dataclass(frozen=True)
class Scope:
    category: str
    navigation_keyword1: str
    navigation_keyword2: str
    shard: str | None = None


@dataclass
class SourceItem:
    item_id: str
    category: str
    navigation_keyword1: str
    navigation_keyword2: str
    question: str
    correct_answer: str
    incorrect_answers: list[str]
    explanation: str | None
    keywords: list[str] | None
    source: str | None
    path: Path
    index: int

    @property
    def normalized_question(self) -> str:
        return normalize_question(self.question)


@dataclass
class PublicCollection:
    collection_id: str
    name: str
    description: str | None
    item_ids: list[str]
    path: Path


def parse_scope_from_path(path: Path) -> Scope:
    parts = path.stem.split(".")
    if len(parts) < 3:
        raise ValueError(f"Unsupported seed filename format: {path}")

    shard: str | None = None
    if len(parts) == 4 and parts[3].isdigit():
        shard = parts[3]
        parts = parts[:3]
    elif len(parts) != 3:
        raise ValueError(f"Unsupported seed filename format: {path}")

    nav2 = re.sub(r"-p\d+$", "", parts[2])
    return Scope(parts[0], parts[1], nav2, shard)


def normalize_question(text: str) -> str:
    return " ".join(text.lower().split())


def is_guid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


def question_prefix(text: str, limit: int = 50) -> str:
    collapsed = " ".join(text.split())
    return collapsed[:limit]


def canonicalize_item_payload(item: SourceItem) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "itemId": item.item_id,
        "category": item.category,
        "navigationKeyword1": item.navigation_keyword1,
        "navigationKeyword2": item.navigation_keyword2,
        "question": item.question,
        "correctAnswer": item.correct_answer,
        "incorrectAnswers": item.incorrect_answers,
    }
    if item.explanation:
        payload["explanation"] = item.explanation
    if item.keywords:
        payload["keywords"] = item.keywords
    if item.source:
        payload["source"] = item.source
    return payload


def load_source_items(source_root: Path = SOURCE_ITEMS_ROOT) -> list[SourceItem]:
    items: list[SourceItem] = []
    for path in sorted(source_root.rglob("*.json")):
        scope = parse_scope_from_path(path)
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise ValueError(f"{path}: expected a JSON array.")

        for index, item in enumerate(raw):
            if not isinstance(item, dict):
                raise ValueError(f"{path} item {index}: expected an object.")

            item_id = str(item.get("itemId", "")).strip()
            if not item_id:
                raise ValueError(f"{path} item {index}: missing itemId.")
            if not is_guid(item_id):
                raise ValueError(f"{path} item {index}: itemId must be a GUID.")

            items.append(
                SourceItem(
                    item_id=item_id,
                    category=str(item.get("category", scope.category)).strip(),
                    navigation_keyword1=str(item.get("navigationKeyword1", scope.navigation_keyword1)).strip(),
                    navigation_keyword2=str(item.get("navigationKeyword2", scope.navigation_keyword2)).strip(),
                    question=str(item.get("question", "")).strip(),
                    correct_answer=str(item.get("correctAnswer", "")).strip(),
                    incorrect_answers=[str(value).strip() for value in item.get("incorrectAnswers", [])],
                    explanation=_optional_str(item.get("explanation")),
                    keywords=_optional_string_list(item.get("keywords")),
                    source=_optional_str(item.get("source")),
                    path=path,
                    index=index,
                )
            )

    return items


def load_public_collections(collections_root: Path = SOURCE_COLLECTIONS_ROOT) -> list[PublicCollection]:
    if not collections_root.exists():
        return []

    collections: list[PublicCollection] = []
    for path in sorted(collections_root.rglob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError(f"{path}: expected an object.")

        collections.append(
            PublicCollection(
                collection_id=str(raw.get("collectionId", "")).strip(),
                name=str(raw.get("name", "")).strip(),
                description=_optional_str(raw.get("description")),
                item_ids=[str(value).strip() for value in raw.get("itemIds", [])],
                path=path,
            )
        )

    return collections


def load_duplicate_allowlist(path: Path = ALLOWLIST_PATH) -> set[tuple[str, str]]:
    if not path.exists():
        return set()

    raw = json.loads(path.read_text(encoding="utf-8"))
    entries = raw.get("allowedDuplicateQuestions", [])
    allowlist: set[tuple[str, str]] = set()
    for entry in entries:
        allowlist.add((str(entry["category"]).strip(), normalize_question(str(entry["question"]).strip())))
    return allowlist


def write_duplicate_allowlist(entries: list[dict[str, str]], path: Path = ALLOWLIST_PATH) -> None:
    REGISTRY_ROOT.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "allowedDuplicateQuestions": sorted(
            entries,
            key=lambda entry: (entry["category"], normalize_question(entry["question"])),
        ),
    }
    write_json(path, payload)


def validate_source(
    items: list[SourceItem],
    collections: list[PublicCollection],
    allowlist: set[tuple[str, str]],
) -> list[str]:
    errors: list[str] = []
    seen_item_ids: dict[str, SourceItem] = {}
    duplicate_groups: dict[tuple[str, str], list[SourceItem]] = {}

    for item in items:
        scope = parse_scope_from_path(item.path)
        if not is_guid(item.item_id):
            errors.append(f"{item.path} item {item.index}: itemId must be a GUID.")
        if item.category != scope.category:
            errors.append(f"{item.path} item {item.index}: category does not match filename scope.")
        if item.navigation_keyword1 != scope.navigation_keyword1:
            errors.append(f"{item.path} item {item.index}: navigationKeyword1 does not match filename scope.")
        if item.navigation_keyword2 != scope.navigation_keyword2:
            errors.append(f"{item.path} item {item.index}: navigationKeyword2 does not match filename scope.")
        if not item.question:
            errors.append(f"{item.path} item {item.index}: question is required.")
        if not item.correct_answer:
            errors.append(f"{item.path} item {item.index}: correctAnswer is required.")

        existing = seen_item_ids.get(item.item_id)
        if existing is not None:
            errors.append(
                f"Duplicate itemId '{item.item_id}' found in {existing.path} and {item.path}."
            )
        else:
            seen_item_ids[item.item_id] = item

        key = (item.category, item.normalized_question)
        duplicate_groups.setdefault(key, []).append(item)

    for key, grouped_items in duplicate_groups.items():
        if len(grouped_items) < 2 or key in allowlist:
            continue
        paths = ", ".join(f"{item.path.name}#{item.index}" for item in grouped_items)
        errors.append(
            f"Duplicate normalized question in category '{key[0]}' for '{grouped_items[0].question}': {paths}"
        )

    known_item_ids = set(seen_item_ids)
    for collection in collections:
        if not collection.collection_id:
            errors.append(f"{collection.path}: collectionId is required.")
        elif not is_guid(collection.collection_id):
            errors.append(f"{collection.path}: collectionId must be a GUID.")
        if not collection.name:
            errors.append(f"{collection.path}: name is required.")
        missing = [item_id for item_id in collection.item_ids if item_id not in known_item_ids]
        if missing:
            errors.append(f"{collection.path}: missing itemIds referenced: {', '.join(missing)}")

    return errors


def write_item_registry(items: list[SourceItem], path: Path = REGISTRY_ROOT / "item-index.csv") -> None:
    REGISTRY_ROOT.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "ItemId",
                "Category",
                "NavigationKeyword1",
                "NavigationKeyword2",
                "QuestionPrefix50",
                "SourceFile",
            ]
        )
        for item in sorted(items, key=lambda entry: (entry.category, entry.navigation_keyword1, entry.navigation_keyword2, entry.question, entry.item_id)):
            writer.writerow(
                [
                    item.item_id,
                    item.category,
                    item.navigation_keyword1,
                    item.navigation_keyword2,
                    question_prefix(item.question),
                    item.path.relative_to(ROOT).as_posix(),
                ]
            )


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


def wipe_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def next_sharded_file_path(category: str, nav1: str, nav2: str, existing_paths: set[Path], root: Path = SOURCE_ITEMS_ROOT) -> Path:
    base = root / category / f"{category}.{nav1}.{nav2}.json"
    if base not in existing_paths and not base.exists():
        return base

    counter = 2
    while True:
        candidate = root / category / f"{category}.{nav1}.{nav2}.{counter:02d}.json"
        if candidate not in existing_paths and not candidate.exists():
            return candidate
        counter += 1


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_string_list(value: Any) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError("Expected a list of strings.")
    result = [str(item).strip() for item in value if str(item).strip()]
    return result or None
