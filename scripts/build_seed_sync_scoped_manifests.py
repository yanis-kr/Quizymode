from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from build_seed_sync_manifest import (
    DEFAULT_DELTA_PREVIEW_LIMIT,
    MAX_ITEMS_PER_REQUEST,
    load_items_from_file,
    parse_scope_from_filename,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build admin-loadable seed-sync manifests at leaf, L1, category, "
            "and all-sync levels."
        )
    )
    parser.add_argument(
        "--source-root",
        default="data/seed-source/items",
        help="Root directory containing source seed JSON files. Default: data/seed-source/items",
    )
    parser.add_argument(
        "--output-root",
        default="data/generated/seed-sync",
        help=(
            "Output directory for generated manifests. "
            "Default: data/generated/seed-sync"
        ),
    )
    parser.add_argument(
        "--seed-set",
        default="core-public-items",
        help="Seed set name stored in every generated manifest. Default: core-public-items",
    )
    parser.add_argument(
        "--delta-preview-limit",
        type=int,
        default=DEFAULT_DELTA_PREVIEW_LIMIT,
        help=(
            "Value to store in each manifest for deltaPreviewLimit. "
            f"Default: {DEFAULT_DELTA_PREVIEW_LIMIT}"
        ),
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=MAX_ITEMS_PER_REQUEST,
        help=(
            "Maximum items per generated manifest file before sharding. "
            f"Default: {MAX_ITEMS_PER_REQUEST}"
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
        help="Fail if a JSON file is skipped because the filename is not category.l1.l2.json.",
    )
    return parser.parse_args()


def sort_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (
            item["category"],
            item["navigationKeyword1"],
            item["navigationKeyword2"],
            item["question"],
            item["seedId"],
        ),
    )


def build_manifest_payload(
    items: list[dict[str, Any]],
    seed_set: str,
    delta_preview_limit: int,
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "seedSet": seed_set,
        "deltaPreviewLimit": delta_preview_limit,
        "items": items,
    }


def format_shard_suffix(item_limit: int) -> str:
    if item_limit % 1000 == 0:
        return f"{item_limit // 1000}k"
    return str(item_limit)


def write_manifest_shards(
    *,
    items: list[dict[str, Any]],
    seed_set: str,
    delta_preview_limit: int,
    output_path: Path,
    chunk_size: int,
) -> list[Path]:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if len(items) <= chunk_size:
        payload = build_manifest_payload(items, seed_set, delta_preview_limit)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=True, indent=2) + "\n",
            encoding="utf-8",
        )
        return [output_path]

    written_paths: list[Path] = []
    stem = output_path.stem
    suffix = output_path.suffix or ".json"

    for start in range(0, len(items), chunk_size):
        end = min(start + chunk_size, len(items))
        shard_suffix = format_shard_suffix(start + chunk_size)
        shard_path = output_path.with_name(f"{stem}{shard_suffix}{suffix}")
        payload = build_manifest_payload(items[start:end], seed_set, delta_preview_limit)
        shard_path.write_text(
            json.dumps(payload, ensure_ascii=True, indent=2) + "\n",
            encoding="utf-8",
        )
        written_paths.append(shard_path)

    return written_paths


def build_scoped_manifests(
    *,
    source_root: Path,
    output_root: Path,
    seed_set: str,
    delta_preview_limit: int,
    chunk_size: int,
    glob_pattern: str,
    fail_on_skipped: bool,
) -> int:
    if delta_preview_limit < 0 or delta_preview_limit > 500:
        raise ValueError("deltaPreviewLimit must be between 0 and 500.")
    if chunk_size <= 0 or chunk_size > MAX_ITEMS_PER_REQUEST:
        raise ValueError(
            f"chunk-size must be between 1 and {MAX_ITEMS_PER_REQUEST}."
        )
    if not source_root.exists():
        raise ValueError(f"Source root does not exist: {source_root}")

    candidate_paths = sorted(path for path in source_root.glob(glob_pattern) if path.is_file())
    skipped_paths: list[Path] = []

    leaf_groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    l1_groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    category_groups: dict[str, list[dict[str, Any]]] = {}
    all_items: list[dict[str, Any]] = []
    seen_seed_ids: dict[str, Path] = {}

    for path in candidate_paths:
        scope = parse_scope_from_filename(path)
        if scope is None:
            skipped_paths.append(path)
            continue

        category, nav1, nav2 = scope
        items = load_items_from_file(path, category, nav1, nav2)

        leaf_groups.setdefault((category, nav1, nav2), []).extend(items)
        l1_groups.setdefault((category, nav1), []).extend(items)
        category_groups.setdefault(category, []).extend(items)

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

    output_root.mkdir(parents=True, exist_ok=True)

    leaf_file_count = 0
    l1_file_count = 0
    category_file_count = 0

    for (category, nav1, nav2), items in sorted(leaf_groups.items()):
        written = write_manifest_shards(
            items=sort_items(items),
            seed_set=seed_set,
            delta_preview_limit=delta_preview_limit,
            output_path=output_root / category / nav1 / f"{nav2}.json",
            chunk_size=chunk_size,
        )
        leaf_file_count += len(written)

    for (category, nav1), items in sorted(l1_groups.items()):
        written = write_manifest_shards(
            items=sort_items(items),
            seed_set=seed_set,
            delta_preview_limit=delta_preview_limit,
            output_path=output_root / category / f"{nav1}.json",
            chunk_size=chunk_size,
        )
        l1_file_count += len(written)

    for category, items in sorted(category_groups.items()):
        written = write_manifest_shards(
            items=sort_items(items),
            seed_set=seed_set,
            delta_preview_limit=delta_preview_limit,
            output_path=output_root / f"{category}.json",
            chunk_size=chunk_size,
        )
        category_file_count += len(written)

    all_written = write_manifest_shards(
        items=sort_items(all_items),
        seed_set=seed_set,
        delta_preview_limit=delta_preview_limit,
        output_path=output_root / "all-sync.json",
        chunk_size=chunk_size,
    )

    print(f"Seed set: {seed_set}")
    print(f"Loaded {len(all_items)} items from {len(candidate_paths) - len(skipped_paths)} files.")
    print(f"Wrote {leaf_file_count} leaf manifests.")
    print(f"Wrote {l1_file_count} L1 manifests.")
    print(f"Wrote {category_file_count} category manifests.")
    print(f"Wrote {len(all_written)} all-sync manifest file(s).")
    if skipped_paths:
        print("Skipped non-seed JSON files:")
        for path in skipped_paths:
            print(f" - {path}")

    return 0


def main() -> int:
    args = parse_args()
    try:
        return build_scoped_manifests(
            source_root=Path(args.source_root).resolve(),
            output_root=Path(args.output_root).resolve(),
            seed_set=args.seed_set,
            delta_preview_limit=args.delta_preview_limit,
            chunk_size=args.chunk_size,
            glob_pattern=args.glob,
            fail_on_skipped=args.fail_on_skipped,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
