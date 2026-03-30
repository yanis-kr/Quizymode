# Supabase

Supabase provides the managed PostgreSQL database for Quizymode in production.

## Current Role

- Managed Postgres database for application data
- Persistent backing store for the API outside local Aspire development

## Operational Notes

- Local development uses PostgreSQL provisioned through Aspire rather than Supabase directly.
- EF Core migrations are applied by the API on startup; production changes should still be treated carefully because they affect the shared managed database.
- Keep connection strings and credentials out of source control and supply them through environment-specific configuration.
