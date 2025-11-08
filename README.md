# Quizymode

A quiz application API built with ASP.NET Core 9, Entity Framework Core, and PostgreSQL, following Vertical Slice Architecture principles and inspired by [Milan Jovanović's Clean Architecture template](https://www.milanjovanovic.tech/pragmatic-clean-architecture).

## Overview

Quizymode is a RESTful API for managing quiz items. It provides endpoints for creating, retrieving, updating, and deleting quiz items with support for categories, subcategories, and duplicate detection using SimHash algorithms.

### Key Features

- **Quiz Item Management**: Create, read, update, and delete quiz items
- **Bulk Operations**: Import multiple items at once
- **Duplicate Detection**: SimHash-based fuzzy matching to prevent duplicate questions
- **PostgreSQL**: Robust relational database with JSONB support for flexible data storage
- **ASP.NET Core 9**: Modern, high-performance web API framework
- **.NET Aspire**: Containerized development environment with PostgreSQL and pgAdmin

## Tech Stack

- **.NET 9.0** - Latest .NET runtime
- **ASP.NET Core 9** - Web API framework
- **Entity Framework Core 9** - ORM with PostgreSQL support
- **PostgreSQL** - Relational database with JSONB support
- **.NET Aspire** - Cloud-ready application orchestration
- **FluentValidation** - Input validation
- **Serilog** - Structured logging

## Getting Started

### Prerequisites

- .NET 9 SDK
- Docker Desktop (for PostgreSQL container)
- .NET Aspire workload (installed automatically)

### Running the Application

1. **Install EF Core Tools** (if not already installed):

   ```bash
   dotnet tool install --global dotnet-ef
   ```

2. **Start the AppHost** (starts API, PostgreSQL, and pgAdmin):

   ```bash
   cd src/Quizymode.Api.AppHost
   dotnet run
   ```

3. **Access the Services**:

   - API: `https://localhost:7279` (or port shown in console)
   - Aspire Dashboard: Opens automatically (typically `https://localhost:17086`)
   - pgAdmin: Access via Aspire Dashboard

4. **Database Setup**:
   - Migrations are applied automatically on startup
   - Initial data is seeded from JSON files in `src/Quizymode.Api/Data/Seed/`

### API Endpoints

- `GET /items` - Get paginated list of quiz items
- `GET /items/random` - Get random quiz items (optional category, subcategory, count)
- `POST /items` - Create a new quiz item
- `POST /items/bulk` - Create multiple items at once
- `DELETE /items/{id}` - Delete a quiz item

## Project Structure

```
src/
├── Quizymode.Api/              # Main API application
│   ├── Features/                # Vertical Slice Architecture features
│   │   └── Items/              # Quiz items feature
│   ├── Shared/                  # Shared code
│   │   ├── Kernel/             # Domain primitives (Result, Error, Entity)
│   │   └── Models/             # Domain models
│   ├── Data/                   # Data access layer
│   │   ├── Configurations/     # EF Core entity configurations
│   │   └── Migrations/         # Database migrations
│   └── Services/               # Application services
├── Quizymode.Api.AppHost/      # Aspire orchestration project
└── Quizymode.Api.ServiceDefaults/  # Shared Aspire service defaults
```

## Development

### Creating Migrations

```bash
cd src/Quizymode.Api
dotnet ef migrations add MigrationName --output-dir Data/Migrations
```

### Applying Migrations

Migrations are applied automatically on startup. To apply manually:

```bash
dotnet ef database update
```

### Running Tests

```bash
dotnet test
```

## Documentation

For detailed documentation, see the `docs/` folder (development documentation only, not included in distribution).

## License

MIT License - see [LICENSE.txt](LICENSE.txt) for details.
