# Repo-Managed Content: Update and Reset

This runbook covers two scenarios:

1. **Normal update** (upsert-only, no deletes) — push new or corrected items from GitHub to prod. Safe to run at any time; idempotent.
2. **Full reset** (delete + rebuild) — wipe all content and rebuild from source. Use when duplicates or inconsistencies require a clean slate.

> **Current prod state (2026-04-05):** No user-created items, uploads, or collections. The content layer has known duplicates and inconsistencies. A full reset is appropriate and safe — no user data is at risk.

---

## System Architecture

- **Env vars** use an `APP_` prefix. The app strips `APP_` and maps `__` to `:` for nested keys. Example: `APP_ConnectionStrings__PostgreSQL` → config key `ConnectionStrings:PostgreSQL`.
- **Taxonomy** (Categories, Keywords, KeywordRelations) is seeded from `docs/quizymode_taxonomy_seed.sql` on every API startup via `DatabaseSeederHostedService`. All inserts use `ON CONFLICT ... DO UPDATE`, so taxonomy is fully idempotent and does not need to be deleted during a reset.
- **Items** are synced via the GitHub-backed Admin Seed Sync endpoint (`POST /admin/seed-sync/apply`). Source: `data/seed-source/items/**/*.json` at a specific repo ref.
- **Collections** (public, repo-managed) are seeded by the startup seeder from `data/seed-dev/collections/`. The only current public collection is the home-sample (`data/seed-dev/collections/home-sample.json`). Collection seeding requires the referenced items to already exist.
- **Startup seeder sequence** (runs on every container start):
  1. Apply EF Core migrations
  2. Apply taxonomy SQL (idempotent)
  3. Upsert 15 seed-dev items from `data/seed-dev/items/` (subset, not full canonical set)
  4. Upsert home-sample collection from `data/seed-dev/collections/`
- **Full canonical item set** is only synced via Admin Seed Sync from GitHub, not by the startup seeder.

### Key Env Vars

| Env var | Config key | Purpose |
|---|---|---|
| `APP_ConnectionStrings__PostgreSQL` | `ConnectionStrings:PostgreSQL` | Database connection string |
| `APP_GitHubSeedSync__Token` | `GitHubSeedSync:Token` | GitHub PAT for API access (read-only, contents scope) |
| `APP_Seed__Path` | `Seed:Path` | Seed data root (default in container: `data/seed-dev`) |

**Agent/local variables** (see `AGENTS.md § Agent Environment Variables`):

| Variable | Used for |
|---|---|
| `QM_AGENT_LOCAL_PGHOST/PORT/DATABASE/USER/PASSWORD/PGSSLMODE` | Local Postgres (Aspire or prod replica) |
| `QM_AGENT_SUPADB_CS` | Production Supabase connection string |

---

## Scenario 1: Normal Update (Upsert-Only)

No deletes. Safe to run at any time. Fixes content errors in existing items; adds new items.

1. Validate source files:
   ```bash
   python scripts/validate_seed_source.py
   python scripts/build_item_registry.py
   ```

2. Get the commit SHA for the ref to sync:
   ```bash
   git rev-parse HEAD        # current local HEAD
   git rev-parse origin/main # remote main
   ```

3. Open the Admin UI at `/admin` → **Seed Sync**.
   - Repository owner/name: the GitHub repo
   - Git ref: the commit SHA (prefer SHA over branch for production)
   - Items path: `data/seed-source/items`
   - Delta preview limit: 200 (or 0 for counts only)
   - Click **Preview sync** — review created/updated counts and the delta table.

4. If the delta looks correct, click **Apply sync**.

5. Idempotency check: preview again with the same SHA — both `createdCount` and `updatedCount` must be 0.

---

## Scenario 2: Full Reset

Deletes all content-layer data, then rebuilds from source. Appropriate when duplicates or inconsistencies cannot be fixed by upsert alone.

Since the prod DB currently has no user-created content, the delete step does not need to filter by `IsRepoManaged`. All rows in content tables can be removed.

### Phase A — Rehearse on a Local Prod Replica

Always rehearse against a local copy of the prod DB before touching real prod.

#### A1. Get a prod DB dump

From the Supabase dashboard: **Database → Backups** (or use `pg_dump` with `$QM_AGENT_SUPADB_CS`, which must point at the direct non-pooled connection on port 5432, not the pooler port).

```bash
pg_dump "$QM_AGENT_SUPADB_CS" \
  --no-owner --no-acl \
  -f quizymode_prod_snapshot.sql
```

Save the snapshot outside the repo.

#### A2. Restore locally

```bash
createdb quizymode_prod_replica
psql -d quizymode_prod_replica -f quizymode_prod_snapshot.sql
```

#### A3. Confirm counts on the replica (read-only audit)

```bash
psql -h localhost -p $QM_AGENT_LOCAL_PGPORT -U $QM_AGENT_LOCAL_PGUSER \
     -d quizymode_prod_replica
```

Run:

```sql
SELECT 'Items' AS tbl, COUNT(*) FROM "Items"
UNION ALL SELECT 'Items private', COUNT(*) FROM "Items" WHERE "IsPrivate" = true
UNION ALL SELECT 'Items user (non-repo)', COUNT(*) FROM "Items" WHERE "IsRepoManaged" = false
UNION ALL SELECT 'Collections', COUNT(*) FROM "Collections"
UNION ALL SELECT 'Collections user (non-repo)', COUNT(*) FROM "Collections" WHERE "IsRepoManaged" = false
UNION ALL SELECT 'Ratings', COUNT(*) FROM "Ratings"
UNION ALL SELECT 'Comments', COUNT(*) FROM "Comments";
```

Confirm: no private items, no user-owned items or collections. If unexpected rows appear, stop and investigate before continuing.

#### A4. Delete content tables (on the replica first)

Run in order (FK constraints require this sequence):

```sql
DELETE FROM "CollectionBookmarks";
DELETE FROM "CollectionRatings";
DELETE FROM "CollectionShares";
DELETE FROM "CollectionItems";
DELETE FROM "ItemKeywords";
DELETE FROM "Comments";
DELETE FROM "Ratings";
DELETE FROM "Collections";
DELETE FROM "Items";
```

Do **not** delete `Categories`, `Keywords`, or `KeywordRelations`. Taxonomy is re-applied idempotently by the startup seeder and must exist before Admin Seed Sync runs.

#### A5. Start the API locally against the replica

```bash
APP_ConnectionStrings__PostgreSQL="Host=$QM_AGENT_LOCAL_PGHOST;Port=$QM_AGENT_LOCAL_PGPORT;Database=quizymode_prod_replica;Username=$QM_AGENT_LOCAL_PGUSER;Password=$QM_AGENT_LOCAL_PGPASSWORD;SSL Mode=$QM_AGENT_LOCAL_PGSSLMODE" \
APP_GitHubSeedSync__Token="<github-pat>" \
dotnet run --project src/Quizymode.Api/Quizymode.Api.csproj
```

On startup the seeder will:
- Re-apply taxonomy SQL (idempotent)
- Upsert the 15 seed-dev items from `data/seed-dev/items/`
- Upsert the home-sample collection (5 of those 15 items are its dependencies)

#### A6. Run Admin Seed Sync for all items

Open `http://localhost:5000/admin` (or wherever the local API runs) → **Seed Sync**:
- Repository owner/name: verify this matches the actual GitHub repo
- Git ref: commit SHA from the branch you want to sync
- Items path: `data/seed-source/items`
- Click **Preview sync** — review counts

Expected: many items created (full canonical set minus the 15 already seeded). No unexpected updates unless the seed-dev items differ from the canonical source.

Click **Apply sync**.

#### A7. Verify the replica

```sql
-- Item count should match canonical source
SELECT COUNT(*) FROM "Items";
SELECT COUNT(*) FROM "Items" WHERE "IsRepoManaged" = true;

-- Home-sample collection should resolve all items
SELECT c."Name", COUNT(ci."ItemId") AS item_count
FROM "Collections" c
JOIN "CollectionItems" ci ON ci."CollectionId" = c."Id"
GROUP BY c."Id", c."Name";

-- No private or non-repo items
SELECT COUNT(*) FROM "Items" WHERE "IsPrivate" = true;
SELECT COUNT(*) FROM "Items" WHERE "IsRepoManaged" = false;
```

Run the same Admin Seed Sync preview again — `createdCount` and `updatedCount` must both be 0.

If counts match expectations and idempotency holds, proceed to Phase B.

---

### Phase B — Apply to Real Production

#### B1. Maintenance window

Put the app behind a maintenance page or restrict writes before running destructive SQL.

#### B2. Take a fresh prod backup

```bash
pg_dump "$QM_AGENT_SUPADB_CS" \
  --no-owner --no-acl \
  -f quizymode_prod_backup_$(date +%Y%m%d_%H%M%S).sql
```

Keep this backup outside the repo and accessible until verification passes.

#### B3. Confirm prod counts (same audit SQL as A3 above)

```bash
psql "$QM_AGENT_SUPADB_CS"
```

Run the same audit queries as A3. Stop if anything unexpected appears.

#### B4. Delete content tables in prod

```bash
psql "$QM_AGENT_SUPADB_CS"
```

Run the same delete sequence as A4.

#### B5. Trigger the startup seeder

**Option 1 — Restart the Lightsail container** (if the API container is already running):

In the Lightsail console, redeploy or restart the service. On startup, the seeder re-applies taxonomy and upserts seed-dev items + home-sample collection.

**Option 2 — Run the API locally pointing at prod** (if you prefer not to restart Lightsail during the window):

```bash
APP_ConnectionStrings__PostgreSQL="$QM_AGENT_SUPADB_CS" \
APP_GitHubSeedSync__Token="<github-pat>" \
dotnet run --project src/Quizymode.Api/Quizymode.Api.csproj
```

This triggers the startup seeder against prod. Once it logs success, stop the local API.

#### B6. Run Admin Seed Sync against prod

Use the same inputs as A6, but targeting the prod API at its live URL or locally via the connection above. Use the same commit SHA used in Phase A.

#### B7. Verify prod

Same queries as A7. Confirm idempotency with a second preview run.

Remove the maintenance window once verification passes.

---

## Rollback

If verification fails at any phase:

1. Stop writes (maintenance window if not already active).
2. Restore from the backup taken in B2:
   ```bash
   psql "$QM_AGENT_SUPADB_CS" -f quizymode_prod_backup_<timestamp>.sql
   ```
3. Verify row counts match the pre-reset snapshot.
4. Keep the failed delete SQL, logs, and any error output for analysis.

---

## Execution Notes

- Use an immutable commit SHA for prod syncs, not a branch name. Branch refs may resolve to a different commit between preview and apply.
- `deltaPreviewLimit: 0` returns counts only with no row listing — useful when the delta is very large and you only need the summary.
- The startup seeder seeds items from `data/seed-dev/items/` (a 15-item subset for dev/demo), not the full canonical set. The full set only comes from Admin Seed Sync.
- Admin Seed Sync does not infer deletes. Any items missing from the GitHub payload are left untouched. That is why the delete step is necessary when the goal is a clean rebuild.
- Collection sync is not yet GitHub-backed. The only public collection (`home-sample`) is seeded by the startup seeder from `data/seed-dev/collections/home-sample.json`. Its 5 referenced items are included in the seed-dev selection and will be present after startup.

---

## Known Gaps

- **Collection sync is not GitHub-backed.** Adding or updating public collections still requires updating `data/seed-dev/collections/` and redeploying the container. This is the main remaining gap for a fully automated content pipeline.
- **Runtime item sync and the Python validation tooling** are not in full parity on all edge cases (e.g. duplicate-question allowlists, filename/scope validation). Validate with `validate_seed_source.py` before syncing to prod.
