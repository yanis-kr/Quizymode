using Microsoft.EntityFrameworkCore;
using Npgsql;
using Quizymode.Api.Data;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    internal static Task InitializeApplicationAsync(this WebApplication app)
    {
        if (IsOpenApiGeneration())
        {
            return Task.CompletedTask;
        }

        return ApplyDatabaseMigrationsAsync(app);
    }

    private static bool IsOpenApiGeneration()
    {
        string commandLine = Environment.CommandLine;
        return
            commandLine.Contains("dotnet-getdocument", StringComparison.OrdinalIgnoreCase) ||
            commandLine.Contains("GetDocument.Insider", StringComparison.OrdinalIgnoreCase);
    }

    private static async Task ApplyDatabaseMigrationsAsync(WebApplication app)
    {
        ILogger logger = app.Services.GetRequiredService<ILoggerFactory>()
            .CreateLogger("Quizymode.Api.StartupExtensions.DatabaseMigration");
        bool poolLogged = false;

        // Runtime startup applies pending migrations before the request pipeline begins.
        // Connection-level failures (e.g. Supavisor EMAXCONNSESSION during a deploy overlap) are retried, #339.
        await StartupDatabaseRetry.ExecuteAsync(
            async ct =>
            {
                using IServiceScope scope = app.Services.CreateScope();
                ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                if (!poolLogged && db.Database.GetConnectionString() is { } connectionString)
                {
                    poolLogged = true;
                    NpgsqlConnectionStringBuilder pool = new(connectionString);
                    logger.LogInformation(
                        "PostgreSQL pool: MaxPoolSize={MaxPoolSize}, ConnectionIdleLifetime={IdleSeconds}s",
                        pool.MaxPoolSize, pool.ConnectionIdleLifetime);
                }

                await db.Database.MigrateAsync(ct);
            },
            logger,
            Task.Delay,
            CancellationToken.None);
    }
}
