using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;

namespace Quizymode.Api.Services;

/// <summary>
/// Background service that runs once per day and deletes expired study guides.
/// Study guides expire 14 days after they were last saved.
/// </summary>
internal sealed class StudyGuideCleanupService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<StudyGuideCleanupService> _logger;

    public StudyGuideCleanupService(
        IServiceScopeFactory scopeFactory,
        ILogger<StudyGuideCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await RunCleanupAsync(stoppingToken);
            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task RunCleanupAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using AsyncServiceScope scope = _scopeFactory.CreateAsyncScope();
            ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            DateTime now = DateTime.UtcNow;
            int deleted = await db.StudyGuides
                .Where(sg => sg.ExpiresAtUtc <= now)
                .ExecuteDeleteAsync(cancellationToken);

            if (deleted > 0)
            {
                _logger.LogInformation(
                    "StudyGuideCleanup: deleted {Count} expired study guide(s) at {UtcNow:O}",
                    deleted, now);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "StudyGuideCleanup: error during cleanup run");
        }
    }
}
