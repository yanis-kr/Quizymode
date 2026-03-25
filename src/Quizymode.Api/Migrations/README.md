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
