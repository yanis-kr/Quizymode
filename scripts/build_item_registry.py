from __future__ import annotations

import sys

from seed_source_common import (
    load_public_collections,
    load_source_items,
    regenerate_taxonomy_seed_sql,
    validate_source,
    write_item_registry,
    write_sitemap,
    write_source_file_index,
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
    write_source_file_index(items)
    write_sitemap(items)
    regenerate_taxonomy_seed_sql()
    source_files = len({item.path for item in items})
    print(f"Wrote registry, source-file-index ({source_files} files), sitemap, and taxonomy seed SQL for {len(items)} items.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
