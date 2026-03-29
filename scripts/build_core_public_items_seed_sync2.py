from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

from build_seed_sync_manifest import (
    DEFAULT_DELTA_PREVIEW_LIMIT,
    MAX_ITEMS_PER_REQUEST,
    normalize_optional_string,
    normalize_string_list,
    parse_scope_from_filename,
)


DEFAULT_CATEGORIES = [
    "tech",
    "languages",
    "humanities",
    "business",
    "civics",
    "sports",
    "nature",
    "trivia",
]

SEED_NAMESPACE = uuid.UUID("1b79c8a4-66e9-4ac4-b7f2-0f9ec8a2f87a")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build data/generated/core-public-items.seed-sync2.json from a "
            "selected set of category directories."
        )
    )
    parser.add_argument(
        "--source-root",
        default="data/seed-source/items",
        help="Root directory containing category seed folders. Default: data/seed-source/items",
    )
    parser.add_argument(
        "--categories",
        nargs="+",
        default=DEFAULT_CATEGORIES,
        help=(
            "Category folders to include. Default: "
            + ", ".join(DEFAULT_CATEGORIES)
        ),
    )
    parser.add_argument(
        "--seed-set",
        default="core-public-items-2",
        help="Seed set name to write into the manifest. Default: core-public-items-2",
    )
    parser.add_argument(
        "--output",
        default="data/generated/core-public-items.seed-sync2.json",
        help=(
            "Output path for the generated manifest. Default: "
            "data/generated/core-public-items.seed-sync2.json"
        ),
    )
    parser.add_argument(
        "--delta-preview-limit",
        type=int,
        default=DEFAULT_DELTA_PREVIEW_LIMIT,
        help=(
            "Value to store in the manifest for deltaPreviewLimit. "
            f"Default: {DEFAULT_DELTA_PREVIEW_LIMIT}"
        ),
    )
    return parser.parse_args()


def build_manifest(
    source_root: Path,
    categories: list[str],
    seed_set: str,
    output_path: Path,
    delta_preview_limit: int,
) -> int:
    if delta_preview_limit < 0 or delta_preview_limit > 500:
        raise ValueError("deltaPreviewLimit must be between 0 and 500.")

    if not source_root.exists():
        raise ValueError(f"Source root does not exist: {source_root}")

    all_items: list[dict] = []
    seen_seed_ids: dict[str, Path] = {}
    loaded_files: list[Path] = []
    generated_seed_ids = 0

    for category_name in categories:
        category_dir = source_root / category_name
        if not category_dir.exists():
            raise ValueError(f"Category folder does not exist: {category_dir}")

        for path in sorted(category_dir.glob("*.json")):
            scope = parse_scope_from_filename(path)
            if scope is None:
                raise ValueError(
                    f"Unsupported JSON filename format in selected categories: {path}"
                )

            category, nav1, nav2 = scope
            items, generated_for_file = load_items_from_file_allowing_missing_seed_ids(
                path, category, nav1, nav2
            )
            generated_seed_ids += generated_for_file
            loaded_files.append(path)

            for item in items:
                seed_id = item["seedId"]
                existing_path = seen_seed_ids.get(seed_id)
                if existing_path is not None:
                    raise ValueError(
                        f"Duplicate seedId '{seed_id}' found in both {existing_path} and {path}."
                    )
                seen_seed_ids[seed_id] = path
                all_items.append(item)

    if not all_items:
        raise ValueError("No items found for the selected categories.")

    all_items.sort(
        key=lambda item: (
            item["category"],
            item["navigationKeyword1"],
            item["navigationKeyword2"],
            item["question"],
            item["seedId"],
        )
    )

    if len(all_items) > MAX_ITEMS_PER_REQUEST:
        raise ValueError(
            f"Manifest contains {len(all_items)} items, which exceeds the max "
            f"sync request size of {MAX_ITEMS_PER_REQUEST}."
        )

    manifest = {
        "schemaVersion": 1,
        "seedSet": seed_set,
        "deltaPreviewLimit": delta_preview_limit,
        "items": all_items,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )

    print(
        f"Wrote {len(all_items)} items from {len(loaded_files)} files "
        f"to {output_path}"
    )
    print("Categories:", ", ".join(categories))
    print("Seed set:", seed_set)
    print("Generated fallback seedIds:", generated_seed_ids)
    return 0


def make_fallback_seed_id(
    category: str,
    nav1: str,
    nav2: str,
    question: str,
    correct_answer: str,
) -> str:
    basis = "\n".join([category, nav1, nav2, question.strip(), correct_answer.strip()])
    return str(uuid.uuid5(SEED_NAMESPACE, basis))


def load_items_from_file_allowing_missing_seed_ids(
    path: Path, category: str, nav1: str, nav2: str
) -> tuple[list[dict], int]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON: {exc}") from exc

    if not isinstance(raw, list):
        raise ValueError(f"{path}: expected a JSON array.")

    items: list[dict] = []
    generated_seed_ids = 0

    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(f"{path} item {index}: expected a JSON object.")

        question = item.get("question")
        correct_answer = item.get("correctAnswer")
        incorrect_answers = item.get("incorrectAnswers")

        if not isinstance(question, str) or not question.strip():
            raise ValueError(f"{path} item {index}: missing non-empty 'question'.")
        if not isinstance(correct_answer, str) or not correct_answer.strip():
            raise ValueError(f"{path} item {index}: missing non-empty 'correctAnswer'.")

        seed_id = item.get("seedId")
        if not isinstance(seed_id, str) or not seed_id.strip():
            seed_id = make_fallback_seed_id(category, nav1, nav2, question, correct_answer)
            generated_seed_ids += 1

        normalized_incorrect_answers = normalize_string_list(
            incorrect_answers, "incorrectAnswers", path, index
        )
        normalized_keywords = (
            normalize_string_list(item["keywords"], "keywords", path, index)
            if "keywords" in item and item["keywords"] is not None
            else None
        )

        existing_category = item.get("category")
        existing_nav1 = item.get("navigationKeyword1")
        existing_nav2 = item.get("navigationKeyword2")

        if existing_category is not None and existing_category != category:
            raise ValueError(
                f"{path} item {index}: category '{existing_category}' does not match "
                f"filename-derived category '{category}'."
            )
        if existing_nav1 is not None and existing_nav1 != nav1:
            raise ValueError(
                f"{path} item {index}: navigationKeyword1 '{existing_nav1}' does not match "
                f"filename-derived value '{nav1}'."
            )
        if existing_nav2 is not None and existing_nav2 != nav2:
            raise ValueError(
                f"{path} item {index}: navigationKeyword2 '{existing_nav2}' does not match "
                f"filename-derived value '{nav2}'."
            )

        normalized_item = {
            "seedId": seed_id,
            "category": category,
            "navigationKeyword1": nav1,
            "navigationKeyword2": nav2,
            "question": question,
            "correctAnswer": correct_answer,
            "incorrectAnswers": normalized_incorrect_answers,
        }

        explanation = normalize_optional_string(
            item.get("explanation"), "explanation", path, index
        )
        if explanation is not None:
            normalized_item["explanation"] = explanation

        if normalized_keywords is not None:
            normalized_item["keywords"] = normalized_keywords

        source = normalize_optional_string(item.get("source"), "source", path, index)
        if source is not None:
            normalized_item["source"] = source

        items.append(normalized_item)

    return items, generated_seed_ids


def main() -> int:
    args = parse_args()
    try:
        return build_manifest(
            source_root=Path(args.source_root).resolve(),
            categories=args.categories,
            seed_set=args.seed_set,
            output_path=Path(args.output).resolve(),
            delta_preview_limit=args.delta_preview_limit,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
