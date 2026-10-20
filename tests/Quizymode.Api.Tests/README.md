# Quizymode.Api.Tests

## Test Coverage

This test project provides comprehensive test coverage for the Quizymode API.

### Test Statistics

- **Total Tests**: 340
- **Passing**: 340
- **Failing**: 0
- **Coverage**: >80% (estimated)

### Test Categories

#### Features Tests

- `Items/Add/AddItemTests` - Single item creation tests
- `Items/AddBulk/AddItemsBulkTests` - Bulk item creation tests
- `Items/Get/GetItemsTests` - Item retrieval and filtering tests
- `Items/Delete/DeleteItemTests` - Item deletion tests

#### Shared Kernel Tests

- `Shared/Kernel/ResultTests` - Result pattern tests
- `Shared/Kernel/ErrorTests` - Error handling tests
- `Shared/Kernel/ResultExtensionsTests` - Result extension method tests

#### Services Tests

- `Services/SimHashServiceTests` - SimHash computation tests

#### Shared HTTP Tests

- `Shared/Http/CustomResultsTests` - HTTP result mapping tests

#### Architecture Tests

- `Architecture/LayerDependencyTests` - namespace dependency guardrails for shared, data, services, features, and startup wiring
- `Architecture/VerticalSliceConventionTests` - vertical-slice conventions for endpoints, handlers, registrations, EF configurations, and MVC controller avoidance

### Running Tests

```bash
# Run all tests
dotnet test

# Run with coverage
dotnet test --collect:"XPlat Code Coverage" --settings coverlet.runsettings

# Run specific test class
dotnet test --filter "FullyQualifiedName~AddItemTests"
```

### Postgres-backed tests

Tests tagged `[Trait("Category", "Postgres")]` (for example `UserUpsertMiddlewarePostgresTests`) start a real PostgreSQL container with Testcontainers and apply the production migrations, so they cover PostgreSQL-only behavior that SQLite cannot run (`FOR UPDATE`, advisory locks, the `IX_Users_Email` unique index).

- They need Docker. Locally, when Docker is unavailable they are reported as skipped.
- In CI (`CI` or `GITHUB_ACTIONS` set to `true`) a container startup failure fails the run instead of skipping.
- Run only these: `dotnet test --filter "Category=Postgres"`. Exclude them: `dotnet test --filter "Category!=Postgres"`.

### Test Patterns

Tests follow these patterns:

- Arrange-Act-Assert structure
- FluentAssertions for readable assertions
- InMemory Database for isolated testing
- Disposable test classes for cleanup

### Coverage Areas

- Feature handlers (Add, Get, Delete, Bulk operations)
- Validation logic (FluentValidation)
- Result pattern usage
- Error handling
- Service implementations (SimHash)
- Duplicate detection logic
- Pagination logic
- Filtering logic
- Architecture and vertical-slice conventions
