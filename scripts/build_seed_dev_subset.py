from __future__ import annotations

import json
import sys
from collections import defaultdict

from seed_source_common import (
    DEV_SELECTION_PATH,
    SEED_DEV_COLLECTIONS_ROOT,
    SEED_DEV_ITEMS_ROOT,
    SOURCE_COLLECTIONS_ROOT,
    SOURCE_ITEMS_ROOT,
    canonicalize_item_payload,
    load_public_collections,
    load_source_items,
    validate_source,
    wipe_directory,
    write_json,
)


def main() -> int:
    if not DEV_SELECTION_PATH.exists():
        print(f"Missing selection manifest: {DEV_SELECTION_PATH}", file=sys.stderr)
        return 1

    selection = json.loads(DEV_SELECTION_PATH.read_text(encoding="utf-8"))
    selected_item_ids = set(selection.get("itemIds", []))
    selected_collection_ids = set(selection.get("collectionIds", []))

    items = load_source_items(SOURCE_ITEMS_ROOT)
    collections = load_public_collections(SOURCE_COLLECTIONS_ROOT)
    validation_errors = validate_source(items, collections)
    if validation_errors:
        for error in validation_errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    items_by_id = {item.item_id: item for item in items}
    collections_by_id = {collection.collection_id: collection for collection in collections}

    missing_item_ids = sorted(item_id for item_id in selected_item_ids if item_id not in items_by_id)
    missing_collection_ids = sorted(collection_id for collection_id in selected_collection_ids if collection_id not in collections_by_id)
    if missing_item_ids or missing_collection_ids:
        if missing_item_ids:
            print(f"Missing itemIds in selection manifest: {', '.join(missing_item_ids)}", file=sys.stderr)
        if missing_collection_ids:
            print(f"Missing collectionIds in selection manifest: {', '.join(missing_collection_ids)}", file=sys.stderr)
        return 1

    wipe_directory(SEED_DEV_ITEMS_ROOT)
    wipe_directory(SEED_DEV_COLLECTIONS_ROOT)

    grouped_items = defaultdict(list)
    for item_id in sorted(selected_item_ids):
        item = items_by_id[item_id]
        grouped_items[item.path.relative_to(SOURCE_ITEMS_ROOT)].append(item)

    for relative_path, grouped in grouped_items.items():
        target_path = SEED_DEV_ITEMS_ROOT / relative_path
        write_json(target_path, [canonicalize_item_payload(item) for item in grouped])

    for collection_id in sorted(selected_collection_ids):
        collection = collections_by_id[collection_id]
        relative_path = collection.path.relative_to(SOURCE_COLLECTIONS_ROOT)
        target_path = SEED_DEV_COLLECTIONS_ROOT / relative_path
        write_json(
            target_path,
            {
                "collectionId": collection.collection_id,
                "name": collection.name,
                "description": collection.description,
                "itemIds": collection.item_ids,
            },
        )

    print(
        f"Wrote seed-dev subset with {len(selected_item_ids)} items and {len(selected_collection_ids)} collections."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
