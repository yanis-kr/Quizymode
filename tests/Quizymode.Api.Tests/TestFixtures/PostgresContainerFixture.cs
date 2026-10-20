using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Quizymode.Api.Data;
using Testcontainers.PostgreSql;
using Xunit;

namespace Quizymode.Api.Tests.TestFixtures;

/// <summary>
/// Starts one real PostgreSQL container per test class and applies the production EF Core migrations
/// (no <c>TestModelCustomizer</c>), so tests can exercise PostgreSQL-only behavior such as
/// <c>FOR UPDATE</c>, advisory locks and the filtered unique index <c>IX_Users_Email</c>.
/// Locally, when Docker is unavailable the fixture records <see cref="UnavailableReason"/> and tests skip;
/// in CI (<c>CI</c> or <c>GITHUB_ACTIONS</c> = true) a startup failure is rethrown so tests can never skip silently.
/// </summary>
public sealed class PostgresContainerFixture : IAsyncLifetime
{
    // Docker Hub, like the Testcontainers Ryuk image. CI pre-pulls it with retries ("Pre-pull Postgres test image"), and the default Missing pull policy then reuses the local copy.
    private const string Image = "postgres:17-alpine";

    private PostgreSqlContainer? _container;

    public string? UnavailableReason { get; private set; }

    public string ConnectionString { get; private set; } = string.Empty;

    public async Task InitializeAsync()
    {
        try
        {
            _container = new PostgreSqlBuilder(Image).Build();
            await _container.StartAsync();
            ConnectionString = _container.GetConnectionString();

            await using ApplicationDbContext db = CreateDbContext();
            await db.Database.MigrateAsync();
        }
        catch (Exception ex) when (!IsCi())
        {
            // Throwing from IClassFixture.InitializeAsync would fail every test; record the reason so they skip.
            UnavailableReason = $"PostgreSQL test container could not be started (is Docker running?): {ex.GetType().Name}: {ex.Message}";
        }
    }

    public async Task DisposeAsync()
    {
        if (_container is not null)
        {
            await _container.DisposeAsync();
        }
    }

    public ApplicationDbContext CreateDbContext(params IInterceptor[] interceptors)
    {
        DbContextOptionsBuilder<ApplicationDbContext> builder = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(ConnectionString)
            .ConfigureWarnings(warnings => warnings.Ignore(RelationalEventId.PendingModelChangesWarning));
        if (interceptors.Length > 0)
        {
            builder.AddInterceptors(interceptors);
        }

        return new ApplicationDbContext(builder.Options);
    }

    private static bool IsCi() =>
        string.Equals(Environment.GetEnvironmentVariable("CI"), "true", StringComparison.OrdinalIgnoreCase)
        || string.Equals(Environment.GetEnvironmentVariable("GITHUB_ACTIONS"), "true", StringComparison.OrdinalIgnoreCase);
}
