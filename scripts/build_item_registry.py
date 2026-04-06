from __future__ import annotations

import sys

from seed_source_common import (
    load_public_collections,
    load_source_items,
    validate_source,
    write_item_registry,
    write_items_bundle,
)


def main() -> int:
    items = load_source_items()
    collections = load_public_collections()
    errors = validate_source(items, collections)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    write_item_registry(items)
    write_items_bundle(items)
    print(f"Wrote registry and bundle for {len(items)} items.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
