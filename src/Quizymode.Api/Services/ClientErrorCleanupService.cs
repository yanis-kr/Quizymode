using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;

namespace Quizymode.Api.Services;

/// <summary>
/// Background service that runs once per day and deletes front-end error reports older than
/// <see cref="RetentionDays"/> days (OBS-001).
/// </summary>
internal sealed class ClientErrorCleanupService(
    IServiceScopeFactory scopeFactory,
    ILogger<ClientErrorCleanupService> logger) : BackgroundService
{
    public const int RetentionDays = 90;

    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await RunCleanupAsync(stoppingToken);
            await Task.Delay(Interval, stoppingToken);
        }
    }

    /// <summary>Deletes reports that occurred before <c>nowUtc - RetentionDays</c>; returns how many.</summary>
    public static Task<int> PruneAsync(ApplicationDbContext db, DateTime nowUtc, CancellationToken cancellationToken)
    {
        DateTime cutoffUtc = nowUtc.AddDays(-RetentionDays);
        return db.ClientErrors
            .Where(clientError => clientError.OccurredUtc < cutoffUtc)
            .ExecuteDeleteAsync(cancellationToken);
    }

    private async Task RunCleanupAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using AsyncServiceScope scope = scopeFactory.CreateAsyncScope();
            ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            DateTime now = DateTime.UtcNow;
            int deleted = await PruneAsync(db, now, cancellationToken);

            if (deleted > 0)
            {
                logger.LogInformation(
                    "ClientErrorCleanup: deleted {Count} client error report(s) older than {RetentionDays} days at {UtcNow:O}",
                    deleted, RetentionDays, now);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "ClientErrorCleanup: error during cleanup run");
        }
    }
}
