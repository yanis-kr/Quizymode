using Microsoft.EntityFrameworkCore;
using Npgsql;
using Quizymode.Api.Data;
using Quizymode.Api.Services.Startup;

namespace Quizymode.Api.StartupExtensions;

internal sealed class EfStartupMigrator(IServiceProvider serviceProvider, ILogger<EfStartupMigrator> logger) : IStartupMigrator
{
    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        using IServiceScope scope = serviceProvider.CreateScope();
        ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        if (db.Database.GetConnectionString() is { } connectionString)
        {
            NpgsqlConnectionStringBuilder pool = new(connectionString);
            logger.LogInformation(
                "PostgreSQL pool: MaxPoolSize={MaxPoolSize}, ConnectionIdleLifetime={IdleSeconds}s",
                pool.MaxPoolSize, pool.ConnectionIdleLifetime);
        }

        await db.Database.MigrateAsync(cancellationToken);
    }
}

/// <summary>
/// The single migration of a boot. Connection-level failures (e.g. Supavisor EMAXCONNSESSION during a deploy overlap)
/// are retried (#339).
/// </summary>
internal sealed class MigrationStartupStep(
    IStartupMigrator migrator,
    ILogger<MigrationStartupStep> logger,
    Func<TimeSpan, CancellationToken, Task>? delay = null) : IStartupGateStep
{
    public string Name => "migrations";

    public Task RunAsync(CancellationToken cancellationToken) =>
        StartupDatabaseRetry.ExecuteAsync(migrator.MigrateAsync, logger, delay ?? Task.Delay, cancellationToken);
}
