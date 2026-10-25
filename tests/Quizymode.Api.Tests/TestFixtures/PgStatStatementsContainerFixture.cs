using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;
using Quizymode.Api.Data;
using Testcontainers.PostgreSql;
using Xunit;

namespace Quizymode.Api.Tests.TestFixtures;

/// <summary>
/// Like <see cref="PostgresContainerFixture"/> but starts PostgreSQL with <c>pg_stat_statements</c> preloaded so a
/// test can read the server's own per-statement call counts. Kept separate so the shared fixture is unchanged.
/// Unlike the shared fixture it never skips: a missing container fails the test (the test needs real server stats).
/// </summary>
public sealed class PgStatStatementsContainerFixture : IAsyncLifetime
{
    private const string Image = "postgres:17-alpine";

    private PostgreSqlContainer? _container;

    public string ConnectionString { get; private set; } = string.Empty;

    public async Task InitializeAsync()
    {
        _container = new PostgreSqlBuilder(Image)
            .WithCommand("-c", "shared_preload_libraries=pg_stat_statements")
            .Build();
        await _container.StartAsync();
        ConnectionString = _container.GetConnectionString();

        await using ApplicationDbContext db = CreateDbContext();
        await db.Database.MigrateAsync();
        await db.Database.ExecuteSqlRawAsync("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
    }

    public async Task DisposeAsync()
    {
        if (_container is not null)
        {
            await _container.DisposeAsync();
        }
    }

    public ApplicationDbContext CreateDbContext() =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(ConnectionString)
            .ConfigureWarnings(warnings => warnings.Ignore(RelationalEventId.PendingModelChangesWarning))
            .Options);

    public async Task<string> ShowAsync(string setting)
    {
        await using NpgsqlConnection connection = new(ConnectionString);
        await connection.OpenAsync();
        await using NpgsqlCommand command = new($"SHOW {setting}", connection);
        return (string)(await command.ExecuteScalarAsync())!;
    }

    public async Task ResetStatementStatsAsync()
    {
        await using NpgsqlConnection connection = new(ConnectionString);
        await connection.OpenAsync();
        await using NpgsqlCommand command = new("SELECT pg_stat_statements_reset()", connection);
        await command.ExecuteNonQueryAsync();
    }

    /// <summary>Total server-side calls of statements in this database whose text contains <paramref name="fragment"/>.</summary>
    public async Task<long> StatementCallsAsync(string fragment)
    {
        await using NpgsqlConnection connection = new(ConnectionString);
        await connection.OpenAsync();
        await using NpgsqlCommand command = new(
            """
            SELECT COALESCE(SUM(calls), 0)::bigint FROM pg_stat_statements
            WHERE query ILIKE @pattern
              AND query NOT ILIKE '%pg_stat_statements%'
              AND dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
            """,
            connection);
        command.Parameters.AddWithValue("pattern", $"%{fragment}%");
        return (long)(await command.ExecuteScalarAsync())!;
    }
}
