from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


MAX_ITEMS_PER_REQUEST = 5000
DEFAULT_DELTA_PREVIEW_LIMIT = 200


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build a consolidated seed-sync manifest from category.l1.l2.json "
            "source files."
        )
    )
    parser.add_argument(
        "--source-root",
        default="data/seed-source/items",
        help="Root directory containing seed JSON files. Default: data/seed-source/items",
    )
    parser.add_argument(
        "--seed-set",
        required=True,
        help="Seed set name to write into the consolidated manifest.",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output path for the generated manifest JSON.",
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
    parser.add_argument(
        "--glob",
        default="**/*.json",
        help="Glob used under source-root to find candidate files. Default: **/*.json",
    )
    parser.add_argument(
        "--fail-on-skipped",
        action="store_true",
        help="Fail if any JSON files are skipped because the filename is not category.l1.l2.json.",
    )
    return parser.parse_args()


def parse_scope_from_filename(path: Path) -> tuple[str, str, str] | None:
    parts = path.stem.split(".")
    if len(parts) != 3 or any(not part.strip() for part in parts):
        return None

    nav2 = re.sub(r"-p\d+$", "", parts[2])
    return parts[0], parts[1], nav2


def normalize_optional_string(value: Any, field_name: str, path: Path, index: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(
            f"{path} item {index}: '{field_name}' must be a string when present."
        )
    return value


def normalize_string_list(value: Any, field_name: str, path: Path, index: int) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"{path} item {index}: '{field_name}' must be an array.")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise ValueError(
                f"{path} item {index}: '{field_name}' must contain only strings."
            )
        result.append(item)
    return result


def load_items_from_file(path: Path, category: str, nav1: str, nav2: str) -> list[dict[str, Any]]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON: {exc}") from exc

    if not isinstance(raw, list):
        raise ValueError(f"{path}: expected a JSON array.")

    items: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(f"{path} item {index}: expected a JSON object.")

        seed_id = item.get("seedId")
        question = item.get("question")
        correct_answer = item.get("correctAnswer")
        incorrect_answers = item.get("incorrectAnswers")

        if not isinstance(seed_id, str) or not seed_id.strip():
            raise ValueError(f"{path} item {index}: missing non-empty 'seedId'.")
        if not isinstance(question, str) or not question.strip():
            raise ValueError(f"{path} item {index}: missing non-empty 'question'.")
        if not isinstance(correct_answer, str) or not correct_answer.strip():
            raise ValueError(f"{path} item {index}: missing non-empty 'correctAnswer'.")

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

    return items


def build_manifest(
    source_root: Path,
    seed_set: str,
    output_path: Path,
    delta_preview_limit: int,
    glob_pattern: str,
    fail_on_skipped: bool,
) -> int:
    if delta_preview_limit < 0 or delta_preview_limit > 500:
        raise ValueError("deltaPreviewLimit must be between 0 and 500.")

    if not source_root.exists():
        raise ValueError(f"Source root does not exist: {source_root}")

    candidate_paths = sorted(path for path in source_root.glob(glob_pattern) if path.is_file())
    skipped_paths: list[Path] = []
    all_items: list[dict[str, Any]] = []
    seen_seed_ids: dict[str, Path] = {}

    for path in candidate_paths:
        scope = parse_scope_from_filename(path)
        if scope is None:
            skipped_paths.append(path)
            continue

        category, nav1, nav2 = scope
        items = load_items_from_file(path, category, nav1, nav2)
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
        raise ValueError(
            f"No valid seed files found under {source_root} using glob '{glob_pattern}'."
        )

    if fail_on_skipped and skipped_paths:
        skipped_list = "\n".join(f" - {path}" for path in skipped_paths)
        raise ValueError(
            "Skipped JSON files with non-seed filename format:\n"
            f"{skipped_list}\n"
            "Expected category.l1.l2.json."
        )

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
        f"Wrote {len(all_items)} items from {len(candidate_paths) - len(skipped_paths)} files "
        f"to {output_path}"
    )
    if skipped_paths:
        print("Skipped non-seed JSON files:")
        for path in skipped_paths:
            print(f" - {path}")

    return 0


def main() -> int:
    args = parse_args()
    source_root = Path(args.source_root).resolve()
    output_path = Path(args.output).resolve()

    try:
        return build_manifest(
            source_root=source_root,
            seed_set=args.seed_set,
            output_path=output_path,
            delta_preview_limit=args.delta_preview_limit,
            glob_pattern=args.glob,
            fail_on_skipped=args.fail_on_skipped,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
