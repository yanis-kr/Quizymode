from __future__ import annotations

import argparse
import json
import subprocess
import sys
import uuid
from collections import defaultdict
from pathlib import Path

from seed_source_common import (
    ROOT,
    SOURCE_ITEMS_ROOT,
    canonicalize_item_payload,
    is_guid,
    load_public_collections,
    load_source_items,
    next_sharded_file_path,
    normalize_question,
    validate_source,
    write_json,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize raw AI import JSON files into canonical seed-source files.")
    parser.add_argument(
        "--inbox-root",
        default=str(ROOT / "data" / "import-inbox"),
        help="Root folder containing raw JSON imports.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write canonical source files. Default is dry-run.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    inbox_root = Path(args.inbox_root)
    if not inbox_root.exists():
        print(f"Inbox root does not exist: {inbox_root}", file=sys.stderr)
        return 1

    existing_items = load_source_items()
    collections = load_public_collections()

    by_item_id = {item.item_id: item for item in existing_items}
    by_question: dict[str, object] = {
        normalize_question(item.question): item for item in existing_items
    }

    pending_groups: dict[tuple[str, str, str], list[dict[str, object]]] = defaultdict(list)
    existing_paths = {item.path for item in existing_items}
    errors: list[str] = []
    warnings: list[str] = []

    for path in sorted(inbox_root.rglob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            errors.append(f"{path}: expected a JSON array.")
            continue

        for index, item in enumerate(raw):
            if not isinstance(item, dict):
                errors.append(f"{path} item {index}: expected an object.")
                continue

            category = str(item.get("category", "")).strip()
            nav1 = str(item.get("navigationKeyword1", "")).strip()
            nav2 = str(item.get("navigationKeyword2", "")).strip()
            question = str(item.get("question", "")).strip()
            correct_answer = str(item.get("correctAnswer", "")).strip()
            incorrect_answers = [str(value).strip() for value in item.get("incorrectAnswers", [])]

            if not category or not nav1 or not nav2 or not question or not correct_answer:
                errors.append(f"{path} item {index}: category, navigationKeyword1, navigationKeyword2, question, and correctAnswer are required.")
                continue

            raw_item_id = str(item.get("itemId", "")).strip()
            if raw_item_id and not is_guid(raw_item_id):
                errors.append(f"{path} item {index}: itemId must be a GUID when provided.")
                continue

            item_id = raw_item_id or str(uuid.uuid4())
            payload = {
                "itemId": item_id,
                "category": category,
                "navigationKeyword1": nav1,
                "navigationKeyword2": nav2,
                "question": question,
                "correctAnswer": correct_answer,
                "incorrectAnswers": incorrect_answers,
            }

            explanation = str(item.get("explanation", "")).strip()
            source = str(item.get("source", "")).strip()
            keywords = [str(value).strip() for value in item.get("keywords", []) if str(value).strip()]
            if explanation:
                payload["explanation"] = explanation
            if source:
                payload["source"] = source[:200]
            if keywords:
                payload["keywords"] = keywords[:50]

            existing_by_id = by_item_id.get(item_id)
            if existing_by_id is not None:
                if canonicalize_item_payload(existing_by_id) != payload:
                    errors.append(f"{path} item {index}: itemId '{item_id}' already exists with different content.")
                else:
                    warnings.append(f"{path} item {index}: itemId '{item_id}' already exists unchanged; skipping.")
                continue

            normalized_q = normalize_question(question)
            if by_question.get(normalized_q):
                warnings.append(f"{path} item {index}: question already exists in canonical source: {question}")
                continue

            by_item_id[item_id] = _payload_to_source_item(payload, path, index)
            by_question[normalized_q] = by_item_id[item_id]
            pending_groups[(category, nav1, nav2)].append(payload)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    if not pending_groups:
        print("No new canonical items to add.")
        return 0

    for warning in warnings:
        print(f"WARNING: {warning}")

    planned_writes: list[tuple[Path, list[dict[str, object]]]] = []
    for scope_key, payloads in sorted(pending_groups.items()):
        target_path = next_sharded_file_path(*scope_key, existing_paths=existing_paths)
        existing_paths.add(target_path)
        planned_writes.append((target_path, payloads))
        print(f"{target_path.relative_to(ROOT)} <- {len(payloads)} item(s)")

    if not args.write:
        print("Dry-run only. Re-run with --write to materialize canonical files.")
        return 0

    for target_path, payloads in planned_writes:
        write_json(target_path, payloads)

    items = load_source_items()
    validation_errors = validate_source(items, collections)
    if validation_errors:
        for error in validation_errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_item_registry.py")], check=True)
    print(f"Wrote {sum(len(payloads) for _, payloads in planned_writes)} new item(s).")
    return 0


def _payload_to_source_item(payload: dict[str, object], path: Path, index: int):
    from seed_source_common import SourceItem

    return SourceItem(
        item_id=str(payload["itemId"]),
        category=str(payload["category"]),
        navigation_keyword1=str(payload["navigationKeyword1"]),
        navigation_keyword2=str(payload["navigationKeyword2"]),
        question=str(payload["question"]),
        correct_answer=str(payload["correctAnswer"]),
        incorrect_answers=[str(value) for value in payload["incorrectAnswers"]],  # type: ignore[index]
        explanation=str(payload["explanation"]) if "explanation" in payload else None,
        keywords=[str(value) for value in payload.get("keywords", [])] or None,  # type: ignore[arg-type]
        source=str(payload["source"]) if "source" in payload else None,
        path=path,
        index=index,
    )


if __name__ == "__main__":
    raise SystemExit(main())
