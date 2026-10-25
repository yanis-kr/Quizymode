# Supabase

Supabase provides the managed PostgreSQL database for Quizymode in production.

## Current Role

- Managed Postgres database for application data
- Persistent backing store for the API outside local Aspire development

## Operational Notes

- Local development uses PostgreSQL provisioned through Aspire rather than Supabase directly.
- EF Core migrations are applied by the API on startup; production changes should still be treated carefully because they affect the shared managed database.
- Keep connection strings and credentials out of source control and supply them through environment-specific configuration.

## Connection Pool (Supavisor session mode)

The pooler in session mode (port 5432) allows 15 client connections in total. Without a cap, Npgsql defaults to 100 connections per process, so one container can use every slot and a deploy overlap (old and new container) fails with `EMAXCONNSESSION` (#339).

- The API caps its Npgsql pool at 5 and closes idle connections after 60 s by default, so one container holds at most 5 slots and a deploy overlap at most 10.
- Optional environment variables (prefix `APP_`): `APP_Database__MaxPoolSize` (default 5, at least 1) and `APP_Database__ConnectionIdleLifetimeSeconds` (default 60, at least 10). They apply only when the connection string does not already set `Maximum Pool Size` / `Connection Idle Lifetime`; an explicit value in the connection string always wins.
- Startup migrations retry up to 6 times (2, 4, 8, 16, 30 s) on `EMAXCONNSESSION` and other transient connection errors. If every attempt fails the process exits and Lightsail restarts the container.
- The startup log contains `PostgreSQL pool: MaxPoolSize=..., ConnectionIdleLifetime=...s` (never the connection string).
