# Migrations

Migrations are applied at startup via `MigrateAsync()` in Program.cs and in DatabaseSeederHostedService. There are no per-migration Ensure* DDL fallbacks; schema comes only from EF migrations.

## Local development (AppHost)

When you run via **AppHost** (`Quizymode.Api.AppHost`), Aspire starts Postgres in a container. If that container (and its data) is recreated each run, the database is **empty on every startup**. In that case you don’t need to drop anything: `MigrateAsync()` runs against an empty DB, applies `InitialCreate`, and seeding runs. No manual steps.

If your local Postgres or volume **persists** between runs (e.g. you reused an existing DB or use a persistent volume), then after a migration reset you must **drop the database once** so the new single migration applies from scratch. After that, normal startup applies the migration and seeds as usual.

## One-time setup after adding a new migration

To add a new migration (e.g. after model changes):

1. **Stop the API** (and any other process using the API project) so the build can copy outputs.
2. From the repo root:
   ```bash
   dotnet ef migrations add YourMigrationName --project src/Quizymode.Api
   ```
3. Start the API. `MigrateAsync()` will apply any pending migrations.

## Unmapped columns: `SearchVector` (global search, #319)

`Items."SearchVector"` and `Collections."SearchVector"` are `tsvector GENERATED ALWAYS ... STORED` columns created by `AddGlobalSearchIndexes` with raw SQL. They are **not in the EF model** (or the model snapshot) on purpose: only the raw SQL in `Features/Search/GlobalSearch.cs` reads them, and mapping them would add the vector to every `Item` load and break `EnsureCreated` in the SQLite test fixture.

Consequence: `has-pending-model-changes` stays clean, but a future migration that changes the **type or length** of a source column (`Question`, `CorrectAnswer`, `Explanation`, `Name`, `Description`) will fail with "cannot alter type of a column used by a generated column". Such a migration must first drop the generated column and its index, alter the column, then recreate both.

The migration also installs the `pg_trgm` extension (collection-name typo tolerance). On Supabase the extension may live in the `extensions` schema; that schema must be on the API role's `search_path` so `gin_trgm_ops` and `<%` resolve.
