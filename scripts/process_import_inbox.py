from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any

from seed_source_common import (
    ROOT,
    SOURCE_ITEMS_ROOT,
    canonicalize_item_payload,
    load_public_collections,
    load_source_items,
    next_sharded_file_path,
    normalize_question,
    validate_source,
    write_json,
)


PROCESSABLE_FILE_SCOPES: dict[str, tuple[str, str, str]] = {
    "nature.animals.predators.json": ("nature", "animals", "predators"),
    "nature.ecosystems.tundra.json": ("nature", "ecosystems", "tundra"),
    "nature.phenomena.aurora.json": ("nature", "phenomena", "aurora"),
    "nature.plants.poisonous.json": ("nature", "plants", "poisonous"),
    "outdoors.navigation.json": ("nature", "navigation", "map-compass"),
    "outdoors.survival.forest.json": ("nature", "survival", "forest"),
    "outdoors.survival.tropical-island.json": ("nature", "survival", "tropical-island"),
    "tennis-trivia.json": ("sports", "tennis", "trivia"),
}

DEFAULT_SOURCE_BY_FILE: dict[str, str] = {
    "nature.animals.predators.json": "https://education.nationalgeographic.org/resource/apex-predators/",
    "nature.ecosystems.tundra.json": "https://www.climate.gov/news-features/featured-images/2024-arctic-report-card-arctic-tundra-now-net-source-carbon-dioxide",
    "nature.phenomena.aurora.json": "https://science.nasa.gov/heliophysics/resources/mysteries-of-the-sun/space-weather-xqefo/",
    "nature.plants.poisonous.json": "https://www.fda.gov/consumers/consumer-updates/outsmarting-poison-ivy-and-other-poisonous-plants",
}

ALLOWED_QUESTIONS_BY_FILE: dict[str, set[str]] = {
    "nature.animals.predators.json": {
        "What is an apex predator?",
    },
    "nature.ecosystems.tundra.json": {
        "Why is the tundra ecosystem particularly vulnerable to climate change?",
    },
    "nature.phenomena.aurora.json": {
        "What causes aurora displays (Northern/Southern Lights)?",
        "What determines the colors seen in aurora displays?",
    },
    "nature.plants.poisonous.json": {
        "What should you do if you suspect contact with a poisonous plant?",
    },
    "outdoors.navigation.json": {
        "How do you find north using the Big Dipper constellation?",
    },
    "outdoors.survival.forest.json": {
        "What is the rule of threes in survival situations?",
    },
    "outdoors.survival.tropical-island.json": {
        "How can you make seawater drinkable in a survival situation?",
    },
    "tennis-trivia.json": set(),
}

MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\((https?://[^)]+)\)")
TRIVIAL_MATH_RE = re.compile(
    r"^(what is|if)\s+[\dxX+\-*/=(). %Ã×]+(?:\?|$)",
    re.IGNORECASE,
)
TRANSLATION_RE = re.compile(
    r"^(how do you say|what is the .* word for|translate:|what does .+ mean in english\?)",
    re.IGNORECASE,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import only quality inbox items into canonical seed-source files, then archive the inbox files."
    )
    parser.add_argument(
        "--inbox-root",
        default=str(ROOT / "data" / "import-inbox"),
        help="Root folder containing raw JSON imports.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write canonical source files and archive processed inbox files.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    inbox_root = Path(args.inbox_root)
    archive_root = inbox_root / "archive"
    if not inbox_root.exists():
        print(f"Inbox root does not exist: {inbox_root}", file=sys.stderr)
        return 1

    existing_items = load_source_items()
    collections = load_public_collections()

    by_item_id = {item.item_id: item for item in existing_items}
    by_question = {normalize_question(item.question): item for item in existing_items}
    existing_paths = {item.path for item in existing_items}

    pending_by_path: dict[Path, list[dict[str, Any]]] = defaultdict(list)
    pending_questions = set(by_question.keys())

    processed_files: list[Path] = []
    summary_lines: list[str] = []
    added_count = 0

    for path in sorted(inbox_root.glob("*.json")):
        processed_files.append(path)
        parsed_items = extract_items(path)
        if parsed_items is None:
            summary_lines.append(f"{path.name}: skipped (unsupported file format)")
            continue

        scope = PROCESSABLE_FILE_SCOPES.get(path.name)
        if scope is None:
            summary_lines.append(f"{path.name}: skipped (not a quality import target)")
            continue

        target_path = resolve_target_path(*scope, existing_paths)
        file_added = 0
        file_skipped = 0

        for raw_item in parsed_items:
            candidate = build_candidate(path, raw_item, scope)
            if candidate is None:
                file_skipped += 1
                continue

            normalized_question = normalize_question(str(candidate["question"]))
            if normalized_question in pending_questions:
                file_skipped += 1
                continue

            item_id = str(candidate["itemId"])
            existing_by_id = by_item_id.get(item_id)
            if existing_by_id is not None:
                if canonicalize_item_payload(existing_by_id) == candidate:
                    file_skipped += 1
                    pending_questions.add(normalized_question)
                    continue
                candidate["itemId"] = str(uuid.uuid4())

            pending_by_path[target_path].append(candidate)
            by_item_id[str(candidate["itemId"])] = _payload_to_source_item(candidate, target_path, 0)
            pending_questions.add(normalized_question)
            file_added += 1
            added_count += 1

        summary_lines.append(f"{path.name}: added {file_added}, skipped {file_skipped}")

    if not args.write:
        for line in summary_lines:
            print(line)
        if added_count == 0:
            print("Dry-run complete: no new quality items would be added.")
        else:
            print(f"Dry-run complete: {added_count} quality item(s) would be added.")
        return 0

    for target_path, payloads in pending_by_path.items():
        current_payload = []
        if target_path.exists():
            raw = json.loads(target_path.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                current_payload = raw
        current_payload.extend(payloads)
        write_json(target_path, current_payload)

    items = load_source_items()
    validation_errors = validate_source(items, collections)
    if validation_errors:
        for error in validation_errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_item_registry.py")], check=True)

    archive_root.mkdir(parents=True, exist_ok=True)
    for path in processed_files:
        archive_path = unique_archive_path(archive_root, path.name)
        shutil.move(str(path), str(archive_path))

    for line in summary_lines:
        print(line)
    print(f"Archived {len(processed_files)} inbox file(s).")
    print(f"Wrote {added_count} new quality item(s).")
    return 0


def extract_items(path: Path) -> list[dict[str, Any]] | None:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, dict):
        nested_items = raw.get("items")
        if isinstance(nested_items, list):
            base = {key: value for key, value in raw.items() if key != "items"}
            merged_items: list[dict[str, Any]] = []
            for item in nested_items:
                if not isinstance(item, dict):
                    continue
                merged = dict(base)
                merged.update(item)
                merged_items.append(merged)
            return merged_items
    return None


def build_candidate(
    path: Path,
    raw_item: dict[str, Any],
    scope: tuple[str, str, str],
) -> dict[str, Any] | None:
    category, nav1, nav2 = scope
    question = clean_text(raw_item.get("question"))
    correct_answer = clean_text(raw_item.get("correctAnswer"))
    incorrect_answers = clean_string_list(raw_item.get("incorrectAnswers"))
    explanation = clean_text(raw_item.get("explanation"))
    keywords = clean_string_list(raw_item.get("keywords"))
    source = normalize_source(raw_item.get("source")) or DEFAULT_SOURCE_BY_FILE.get(path.name)

    if not question or not correct_answer or len(incorrect_answers) != 3:
        return None
    if not is_quality_item(path.name, question, correct_answer, explanation, keywords):
        return None

    payload: dict[str, Any] = {
        "itemId": normalize_item_id(raw_item.get("itemId")),
        "category": category,
        "navigationKeyword1": nav1,
        "navigationKeyword2": nav2,
        "question": question,
        "correctAnswer": correct_answer,
        "incorrectAnswers": incorrect_answers,
    }

    if explanation:
        payload["explanation"] = explanation
    if keywords:
        payload["keywords"] = keywords[:50]
    if source:
        payload["source"] = source[:200]

    return payload


def is_quality_item(
    file_name: str,
    question: str,
    correct_answer: str,
    explanation: str | None,
    keywords: list[str],
) -> bool:
    normalized = normalize_question(question)
    if len(question) < 18 or len(correct_answer) < 2:
        return False
    allowed_questions = ALLOWED_QUESTIONS_BY_FILE.get(file_name)
    if allowed_questions is not None and question not in allowed_questions:
        return False
    if TRIVIAL_MATH_RE.match(question):
        return False
    if TRANSLATION_RE.match(question):
        return False
    if file_name.startswith(("bulk-", "tests.", "items-", "language.", "french-", "spanish-")):
        return False
    if file_name in {
        "general.trivia.json",
        "geography.capitals.json",
        "history.us-history.json",
        "science.astronomy.json",
        "sports.soccer.json",
        "certs.aws.saa-c02.json",
        "culture.food.json",
        "entertainment.movies.json",
        "puzzles.riddles.json",
        "bulk-us-history.json",
        "science.anatomy.muscular.json",
        "general.world-records.json",
        "general.world-records.animals.json",
        "general.world-records.humans.json",
        "general.world-records.weird.json",
    }:
        return False
    if "panicking" in normalized:
        return False
    if normalized in {
        "what is the main characteristic of tundra ecosystems?",
        "where are auroras most commonly visible?",
        "what should you avoid when signaling for rescue on a tropical island?",
        "what is the most important priority when lost in a forest?",
        "how many players are on a soccer team on the field at one time?",
        "how long is a standard soccer match (excluding extra time)?",
    }:
        return False
    if explanation is None or len(explanation) < 20:
        return False
    if len(keywords) == 0:
        return False
    return True


def normalize_item_id(value: Any) -> str:
    text = clean_text(value)
    if text:
        try:
            return str(uuid.UUID(text))
        except ValueError:
            pass
    return str(uuid.uuid4())


def normalize_source(value: Any) -> str | None:
    text = clean_text(value)
    if not text or text.lower() == "initial seed":
        return None
    match = MARKDOWN_LINK_RE.search(text)
    if match:
        return match.group(1)
    return text if text.startswith("http://") or text.startswith("https://") else None


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return (
        text.replace("Ã—", "x")
        .replace("â€™", "'")
        .replace("Ã©", "e")
        .replace("Ã¡", "a")
        .replace("Ã­", "i")
        .replace("Ã±", "n")
        .replace("Â¿", "¿")
        .replace("Ã³", "o")
        .replace("Ãº", "u")
        .replace("Ã", "")
    )


def clean_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [clean_text(item) for item in value if clean_text(item)]


def resolve_target_path(category: str, nav1: str, nav2: str, existing_paths: set[Path]) -> Path:
    base = SOURCE_ITEMS_ROOT / category / f"{category}.{nav1}.{nav2}.json"
    if base.exists():
        return base
    target_path = next_sharded_file_path(category, nav1, nav2, existing_paths)
    existing_paths.add(target_path)
    return target_path


def unique_archive_path(archive_root: Path, file_name: str) -> Path:
    target = archive_root / file_name
    if not target.exists():
        return target
    stem = Path(file_name).stem
    suffix = Path(file_name).suffix
    counter = 2
    while True:
        candidate = archive_root / f"{stem}.{counter:02d}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def _payload_to_source_item(payload: dict[str, Any], path: Path, index: int):
    from seed_source_common import SourceItem

    return SourceItem(
        item_id=str(payload["itemId"]),
        category=str(payload["category"]),
        navigation_keyword1=str(payload["navigationKeyword1"]),
        navigation_keyword2=str(payload["navigationKeyword2"]),
        question=str(payload["question"]),
        correct_answer=str(payload["correctAnswer"]),
        incorrect_answers=[str(value) for value in payload["incorrectAnswers"]],
        explanation=str(payload["explanation"]) if "explanation" in payload else None,
        keywords=[str(value) for value in payload.get("keywords", [])] or None,
        source=str(payload["source"]) if "source" in payload else None,
        path=path,
        index=index,
    )


if __name__ == "__main__":
    raise SystemExit(main())
