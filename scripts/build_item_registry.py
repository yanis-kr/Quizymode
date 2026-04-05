from __future__ import annotations

import sys

from seed_source_common import (
    load_duplicate_allowlist,
    load_public_collections,
    load_source_items,
    validate_source,
    write_item_registry,
)


def main() -> int:
    items = load_source_items()
    collections = load_public_collections()
    allowlist = load_duplicate_allowlist()
    errors = validate_source(items, collections, allowlist)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    write_item_registry(items)
    print(f"Wrote registry for {len(items)} items.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
