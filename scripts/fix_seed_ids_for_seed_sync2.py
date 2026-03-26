from __future__ import annotations

import json
import uuid
from pathlib import Path


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

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "data" / "bulk-seed"
REFERENCE_MANIFEST = ROOT / "data" / "generated" / "core-public-items.seed-sync.json"
SEED_SYNC2_NAMESPACE = uuid.UUID("7f0f7d7a-5c7a-4f75-8d48-9a9de4db1a21")


def make_seed_id(relative_path: str, index: int, question: str, correct_answer: str, salt: int = 0) -> str:
    basis = "\n".join(
        [
            relative_path,
            str(index),
            question.strip(),
            correct_answer.strip(),
            str(salt),
        ]
    )
    return str(uuid.uuid5(SEED_SYNC2_NAMESPACE, basis))


def main() -> int:
    reference = json.loads(REFERENCE_MANIFEST.read_text(encoding="utf-8"))
    reference_ids = {item["seedId"] for item in reference["items"]}

    selected_paths: list[Path] = []
    for category in DEFAULT_CATEGORIES:
        selected_paths.extend(sorted((SOURCE_ROOT / category).glob("*.json")))

    assigned_ids: set[str] = set()
    changed_files = 0
    generated_missing = 0
    remapped_collisions = 0
    remapped_duplicates = 0

    for path in selected_paths:
        relative_path = path.relative_to(ROOT).as_posix()
        data = json.loads(path.read_text(encoding="utf-8"))
        changed = False

        for index, item in enumerate(data):
            if not isinstance(item, dict):
                continue

            question = item.get("question")
            correct_answer = item.get("correctAnswer")
            if not isinstance(question, str) or not question.strip():
                continue
            if not isinstance(correct_answer, str) or not correct_answer.strip():
                continue

            old_seed_id = item.get("seedId")
            need_new_id = False

            if not isinstance(old_seed_id, str) or not old_seed_id.strip():
                need_new_id = True
                generated_missing += 1
            elif old_seed_id in reference_ids:
                need_new_id = True
                remapped_collisions += 1
            elif old_seed_id in assigned_ids:
                need_new_id = True
                remapped_duplicates += 1

            if need_new_id:
                salt = 0
                new_seed_id = make_seed_id(relative_path, index, question, correct_answer, salt)
                while new_seed_id in reference_ids or new_seed_id in assigned_ids:
                    salt += 1
                    new_seed_id = make_seed_id(relative_path, index, question, correct_answer, salt)
                item["seedId"] = new_seed_id
                assigned_ids.add(new_seed_id)
                changed = True
            else:
                assigned_ids.add(old_seed_id)

        if changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            changed_files += 1

    print("files_scanned", len(selected_paths))
    print("files_changed", changed_files)
    print("seedids_generated_for_missing", generated_missing)
    print("seedids_remapped_for_reference_collisions", remapped_collisions)
    print("seedids_remapped_for_selected_duplicates", remapped_duplicates)
    print("reference_manifest_ids", len(reference_ids))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
