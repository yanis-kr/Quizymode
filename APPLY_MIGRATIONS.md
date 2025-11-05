# How to Apply Database Migrations

If you see the error "relation 'items' does not exist", the database migrations haven't been applied yet.

## Quick Fix: Apply Migrations Manually

### Step 1: Get Connection String from Aspire Dashboard

1. Open the Aspire Dashboard (usually at `https://localhost:17086`)
2. Click on the **"postgres"** service
3. Look for the **Connection String** section
4. Copy the connection string (it will look like: `Host=localhost;Port=5432;Database=quizymode;Username=postgres;Password=...`)

### Step 2: Apply Migrations

Run this command with the connection string from Step 1:

```bash
cd src/Quizymode.Api
dotnet ef database update --connection "Host=localhost;Port=5432;Database=quizymode;Username=postgres;Password=YOUR_PASSWORD"
```

**Or** if you know the password is `postgres`:

```bash
cd src/Quizymode.Api
dotnet ef database update --connection "Host=localhost;Port=5432;Database=quizymode;Username=postgres;Password=postgres"
```

### Step 3: Verify

1. Check pgAdmin - you should now see the `items` table
2. Restart the API - the seeder should now populate data

## Why This Happens

The `DatabaseSeederHostedService` should automatically apply migrations on startup, but sometimes:
- The database isn't ready when the seeder runs
- Connection issues occur during startup
- The seeder fails silently

## After Applying Manually

Once migrations are applied manually, the seeder will:
- Skip migrations (already applied)
- Seed initial data from JSON files in `Data/Seed/`

## Future Runs

After the first manual migration, the automatic seeder should work correctly on subsequent startups.

