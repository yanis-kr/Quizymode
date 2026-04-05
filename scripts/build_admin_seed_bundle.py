from __future__ import annotations

import argparse
import sys
from pathlib import Path

from seed_source_common import (
    GENERATED_BUNDLE_PATH,
    load_duplicate_allowlist,
    load_public_collections,
    load_source_items,
    validate_source,
    write_json,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the admin item-sync bundle from canonical seed-source files.")
    parser.add_argument("--seed-set", default="core-public-items", help="Seed-set label stored in the bundle metadata.")
    parser.add_argument("--delta-preview-limit", type=int, default=200, help="Preview limit stored in the bundle metadata.")
    parser.add_argument("--output", default=str(GENERATED_BUNDLE_PATH), help="Output path for the generated bundle.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    items = load_source_items()
    collections = load_public_collections()
    allowlist = load_duplicate_allowlist()
    errors = validate_source(items, collections, allowlist)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    payload = {
        "schemaVersion": 1,
        "seedSet": args.seed_set,
        "deltaPreviewLimit": args.delta_preview_limit,
        "items": [
            {
                "itemId": item.item_id,
                "category": item.category,
                "navigationKeyword1": item.navigation_keyword1,
                "navigationKeyword2": item.navigation_keyword2,
                "question": item.question,
                "correctAnswer": item.correct_answer,
                "incorrectAnswers": item.incorrect_answers,
                **({"explanation": item.explanation} if item.explanation else {}),
                **({"keywords": item.keywords} if item.keywords else {}),
                **({"source": item.source} if item.source else {}),
            }
            for item in sorted(
                items,
                key=lambda entry: (
                    entry.category,
                    entry.navigation_keyword1,
                    entry.navigation_keyword2,
                    entry.question,
                    entry.item_id,
                ),
            )
        ],
    }

    write_json(Path(args.output), payload)
    print(f"Wrote admin bundle with {len(items)} items to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
