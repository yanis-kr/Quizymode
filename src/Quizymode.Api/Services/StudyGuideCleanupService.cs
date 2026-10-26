using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Services;

/// <summary>
/// Background service that runs once per day and removes expired study guide data:
/// <list type="bullet">
/// <item>study guide documents (AC 6.6) past <c>ExpiresUtc</c> (30 days after the last activity): documents with no saved
/// questions are deleted (sections cascade); documents with saved questions are kept, but their section text is cleared.
/// Shared generations and candidates stay as the cache; accepted items and collections are untouched;</item>
/// <item>LLM attempt log rows older than 90 days.</item>
/// </list>
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

    internal sealed record CleanupResult(int Documents, int SectionsCleared, int Attempts);

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
            int attemptRetentionDays = scope.ServiceProvider.GetService<IOptions<StudyGuideGenerationOptions>>()?.Value.AttemptRetentionDays ?? 90;

            DateTime now = DateTime.UtcNow;
            CleanupResult result = await CleanupAsync(db, now, attemptRetentionDays, cancellationToken);

            if (result.Documents + result.SectionsCleared + result.Attempts > 0)
            {
                _logger.LogInformation(
                    "StudyGuideCleanup: deleted {Documents} document(s), cleared text of {Sections} section(s), trimmed {Attempts} LLM attempt(s) at {UtcNow:O}",
                    result.Documents,
                    result.SectionsCleared,
                    result.Attempts,
                    now);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "StudyGuideCleanup: error during cleanup run");
        }
    }

    internal static async Task<CleanupResult> CleanupAsync(
        ApplicationDbContext db,
        DateTime nowUtc,
        int attemptRetentionDays,
        CancellationToken cancellationToken)
    {
        int sectionsCleared = await db.StudyGuideSections
            .Where(section => section.Text != null &&
                db.StudyGuideDocuments.Any(document =>
                    document.Id == section.DocumentId &&
                    document.ExpiresUtc <= nowUtc &&
                    db.StudyGuideAcceptedCandidates.Any(accepted => accepted.DocumentId == document.Id)))
            .ExecuteUpdateAsync(setters => setters.SetProperty(section => section.Text, (string?)null), cancellationToken);

        int documents = await db.StudyGuideDocuments
            .Where(document => document.ExpiresUtc <= nowUtc &&
                !db.StudyGuideAcceptedCandidates.Any(accepted => accepted.DocumentId == document.Id))
            .ExecuteDeleteAsync(cancellationToken);

        DateTime attemptCutoff = nowUtc.AddDays(-Math.Max(1, attemptRetentionDays));
        int attempts = await db.LlmAttempts
            .Where(attempt => attempt.CreatedUtc < attemptCutoff)
            .ExecuteDeleteAsync(cancellationToken);

        return new CleanupResult(documents, sectionsCleared, attempts);
    }
}
