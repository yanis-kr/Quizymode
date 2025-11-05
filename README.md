# Quizymode

A quiz application built with ASP.NET Core 9, Entity Framework Core, and PostgreSQL.

## Attribution

This project uses code and patterns from [Milan Jovanović's Clean Architecture template](https://www.milanjovanovic.tech/pragmatic-clean-architecture). See [ATTRIBUTION.md](ATTRIBUTION.md) for details.

## Documentation

- **[Entity Framework Core Guide](docs/ENTITY_FRAMEWORK_GUIDE.md)** - Complete guide to EF Core, migrations, and the database seeder
- **[PostgreSQL Setup](docs/POSTGRESQL_SETUP.md)** - Setup instructions for PostgreSQL with Aspire
- **[PostgreSQL Migration Guide](docs/POSTGRESQL_MIGRATION_GUIDE.md)** - Detailed migration guide from MongoDB to PostgreSQL

## Quick Start

1. **Install EF Core Tools:**
   ```bash
   dotnet tool install --global dotnet-ef
   ```

2. **Start the AppHost:**
   ```bash
   cd src/Quizymode.Api.AppHost
   dotnet run
   ```

3. **Migrations are applied automatically** on startup via `DatabaseSeederHostedService`

## Quick Reference

### Create a Migration
```bash
cd src/Quizymode.Api
dotnet ef migrations add MigrationName --output-dir Data/Migrations
```

### Apply Migrations Manually
```bash
dotnet ef database update
```

### Check Migration Status
```bash
dotnet ef migrations list
```

For detailed information, see the [Entity Framework Core Guide](docs/ENTITY_FRAMEWORK_GUIDE.md).