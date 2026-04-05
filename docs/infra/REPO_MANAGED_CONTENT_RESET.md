# Repo-Managed Content Reset

This runbook describes how to remove all repo-managed content from a database and recreate it from source control.

## Purpose

Use this when the repo-managed public content layer has drifted, accumulated duplicates, or needs a clean rebuild from canonical source files.

This runbook is intentionally scoped to the content layer:

- `Categories`
- `Keywords`
- `KeywordRelations`
- `Items`
- `ItemKeywords`
- `Collections`
- `CollectionItems`

It should not be used to wipe operational or user-side tables such as `Users`, `Uploads`, `StudyGuides`, `Audits`, or `PageViews`.

## Preconditions

1. `Items` and `Collections` must have `IsRepoManaged`.
2. Canonical source files under `data/seed-source/` must validate cleanly.
3. The reset must be rehearsed locally against a production snapshot first.
4. Production must be freshly audited before execution.
5. A rollback path must exist before any delete runs.

## Canonical Inputs

- Items: `data/seed-source/items/**/*.json`
- Public collections: `data/seed-source/collections/public/**/*.json`
- Registry: `data/seed-source/_registry/item-index.csv`
- Seed-dev selection: `data/seed-dev/selection.json`

## Rehearsal Flow

1. Load the latest production snapshot into a local repro database.
2. Run `python scripts/validate_seed_source.py`.
3. Run `python scripts/build_item_registry.py`.
4. Run the destructive delete order against the local repro database.
5. Start the app locally and confirm the content layer is empty.
6. Reseed from source control.
7. Verify counts, taxonomy resolution, sports/soccer duplicates, and public collections.
8. Run the seed/import again to confirm idempotency.

## Fresh Production Audit

Immediately before a production reset:

1. Take a fresh read-only snapshot outside the repo.
2. Confirm counts for private items, non-repo-managed items, comments, ratings, collections, collection bookmarks, collection shares, and collection ratings.
3. Confirm whether taxonomy is safe to keep or whether it should also be rebuilt from source control.
4. Stop if unexpected user-owned content appears.

## Backup

Before any delete:

1. Create a full database backup or a restorable dump of the affected content tables.
2. Save the exact read-only audit SQL and backup metadata outside the repo.
3. Put the app behind a maintenance window so no new writes arrive during reset.

## Reset Modes

### Mode A: Reset Items And Collections Only

Use this when existing taxonomy rows are trusted and will be reused.

Delete order:

1. `CollectionBookmarks` for repo-managed collections
2. `CollectionRatings` for repo-managed collections
3. `CollectionShares` for repo-managed collections
4. `CollectionItems` for repo-managed collections
5. `Comments` for repo-managed items
6. `Ratings` for repo-managed items
7. `ItemKeywords` for repo-managed items
8. repo-managed `Collections`
9. repo-managed `Items`

Rebuild order:

1. repo-managed `Items`
2. `ItemKeywords`
3. repo-managed `Collections`
4. `CollectionItems`

### Mode B: Reset Full Repo-Managed Content Layer

Use this when taxonomy is also fully source-controlled and should be rebuilt.

Delete order:

1. `CollectionBookmarks` for repo-managed collections
2. `CollectionRatings` for repo-managed collections
3. `CollectionShares` for repo-managed collections
4. `CollectionItems` for repo-managed collections
5. `Comments` for repo-managed items
6. `Ratings` for repo-managed items
7. `ItemKeywords` for repo-managed items
8. repo-managed `Collections`
9. repo-managed `Items`
10. `KeywordRelations`
11. `Keywords`
12. `Categories`

Rebuild order:

1. `Categories`
2. `Keywords`
3. `KeywordRelations`
4. repo-managed `Items`
5. `ItemKeywords`
6. repo-managed `Collections`
7. `CollectionItems`

## Execution Notes

1. Repo-managed content should be selected by `IsRepoManaged = true`, not by `CreatedBy = 'seeder'`.
2. User-created content should be left untouched.
3. Admin seed sync is upsert-only and does not infer deletes from missing rows.
4. Collection seed files must fail fast if they reference missing `itemId` values.
5. The same source-control bundle should be safe to apply multiple times.

## Verification Checklist

After reset and reseed:

1. The number of repo-managed items matches the canonical bundle.
2. Public collections resolve all referenced items.
3. No duplicate normalized public questions remain unless explicitly allowed.
4. Sports and soccer duplicate cases are gone.
5. App browse, item detail, collections, and admin seed sync all work.
6. Re-running the same seed import produces no additional duplicates.

## Rollback

If verification fails:

1. Stop writes.
2. Restore from the backup created before reset.
3. Verify row counts on the restored database.
4. Keep the failed reset SQL, logs, and validation notes outside the repo for analysis.
