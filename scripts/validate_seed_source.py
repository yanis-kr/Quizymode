from __future__ import annotations

import sys

from seed_source_common import (
    load_duplicate_allowlist,
    load_public_collections,
    load_source_items,
    validate_source,
)


def main() -> int:
    items = load_source_items()
    collections = load_public_collections()
    allowlist = load_duplicate_allowlist()
    errors = validate_source(items, collections, allowlist)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"Validation failed with {len(errors)} error(s).", file=sys.stderr)
        return 1

    print(f"Validated {len(items)} items and {len(collections)} public collections.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
