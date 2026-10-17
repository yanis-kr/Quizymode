using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

/// <summary>
/// Startup hosted service that backfills <see cref="AnalyticsSession"/> rows for
/// <see cref="PageView"/> session ids that predate the TRAFFIC-122 session table. Runs in batches of
/// <see cref="BatchSize"/> and is idempotent by construction: it only ever selects session ids with
/// no corresponding row, so a repeat run (including a re-deploy) inserts nothing once caught up.
/// </summary>
/// <remarks>
/// Historical page hits never recorded a referrer, so every backfilled row has <c>ReferrerHost =
/// null</c> and <c>VisitorId = null</c>; the channel therefore resolves to <c>direct</c> or
/// <c>campaign</c> (if the stored query string carried UTM tags) and never to <c>search</c>,
/// <c>social</c>, <c>referral</c>, or <c>paid</c> — there is no referrer or click-id data to support
/// those classifications for history. This is expected.
/// </remarks>
internal sealed class AnalyticsSessionBackfill(
    IServiceProvider serviceProvider,
    ILogger<AnalyticsSessionBackfill> logger) : IHostedService
{
    private const int BatchSize = 5000;

    private readonly IServiceProvider _serviceProvider = serviceProvider;
    private readonly ILogger<AnalyticsSessionBackfill> _logger = logger;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            using IServiceScope scope = _serviceProvider.CreateScope();
            ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            IAttributionClassifier classifier = scope.ServiceProvider.GetRequiredService<IAttributionClassifier>();

            int totalInserted = 0;
            while (true)
            {
                int inserted = await RunBatchAsync(db, classifier, cancellationToken);
                totalInserted += inserted;

                if (inserted < BatchSize)
                {
                    break;
                }
            }

            if (totalInserted > 0)
            {
                _logger.LogInformation(
                    "AnalyticsSessionBackfill: created {Count} AnalyticsSession row(s) for pre-existing PageView sessions.",
                    totalInserted);
            }
        }
        catch (Exception ex)
        {
            // Best-effort: a failed backfill must never block API startup. It will retry on the next deploy.
            _logger.LogError(ex, "AnalyticsSessionBackfill: backfill run failed.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static async Task<int> RunBatchAsync(
        ApplicationDbContext db,
        IAttributionClassifier classifier,
        CancellationToken cancellationToken)
    {
        List<string> missingSessionIds = await db.PageViews
            .Select(pageView => pageView.SessionId)
            .Distinct()
            .Where(sessionId => !db.AnalyticsSessions.Any(session => session.SessionId == sessionId))
            .OrderBy(sessionId => sessionId)
            .Take(BatchSize)
            .ToListAsync(cancellationToken);

        if (missingSessionIds.Count == 0)
        {
            return 0;
        }

        List<HistoricalHit> candidateHits = await db.PageViews
            .Where(pageView => missingSessionIds.Contains(pageView.SessionId))
            .Select(pageView => new HistoricalHit(
                pageView.SessionId,
                pageView.CreatedUtc,
                pageView.Id,
                pageView.Path,
                pageView.QueryString,
                pageView.UserAgent,
                pageView.UserId))
            .ToListAsync(cancellationToken);

        Dictionary<string, HistoricalHit> earliestBySession = candidateHits
            .GroupBy(hit => hit.SessionId)
            .ToDictionary(
                group => group.Key,
                group => group.OrderBy(hit => hit.CreatedUtc).ThenBy(hit => hit.Id).First());

        DateTime createdUtc = DateTime.UtcNow;
        List<AnalyticsSession> toInsert = [];
        foreach (string sessionId in missingSessionIds)
        {
            if (!earliestBySession.TryGetValue(sessionId, out HistoricalHit? earliest))
            {
                // No PageView row matched (should not happen given the query above); skip defensively.
                continue;
            }

            (string? utmSource, string? utmMedium, string? utmCampaign, string? utmContent, string? utmTerm) =
                ParseUtmFromQueryString(earliest.QueryString);

            AttributionResult attribution = classifier.Classify(new AttributionRequest(
                ReferrerUrl: null,
                RequestHost: null,
                UtmSource: utmSource,
                UtmMedium: utmMedium,
                UtmCampaign: utmCampaign,
                UtmContent: utmContent,
                UtmTerm: utmTerm));

            toInsert.Add(new AnalyticsSession
            {
                Id = Guid.NewGuid(),
                SessionId = sessionId,
                VisitorId = null,
                UserId = earliest.UserId,
                FirstSeenUtc = earliest.CreatedUtc,
                LandingPath = earliest.Path,
                LandingQuery = earliest.QueryString,
                ReferrerHost = null,
                UtmSource = attribution.UtmSource,
                UtmMedium = attribution.UtmMedium,
                UtmCampaign = attribution.UtmCampaign,
                UtmContent = attribution.UtmContent,
                UtmTerm = attribution.UtmTerm,
                ClickIdPlatform = null,
                Channel = attribution.Channel,
                DeviceClass = classifier.ClassifyDeviceClass(earliest.UserAgent),
                Country = null,
                AppVersion = null,
                CreatedUtc = createdUtc
            });
        }

        if (toInsert.Count == 0)
        {
            return missingSessionIds.Count;
        }

        db.AnalyticsSessions.AddRange(toInsert);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // A concurrent backfill run (or a live first-hit write) raced us for one of these session
            // ids. Drop the tracked batch; the next loop iteration re-queries what's still missing.
            db.ChangeTracker.Clear();
        }

        return missingSessionIds.Count;
    }

    private static (string? Source, string? Medium, string? Campaign, string? Content, string? Term) ParseUtmFromQueryString(
        string queryString)
    {
        if (string.IsNullOrWhiteSpace(queryString))
        {
            return (null, null, null, null, null);
        }

        Dictionary<string, StringValues> parsed = QueryHelpers.ParseQuery(queryString);

        return (
            GetValue(parsed, "utm_source"),
            GetValue(parsed, "utm_medium"),
            GetValue(parsed, "utm_campaign"),
            GetValue(parsed, "utm_content"),
            GetValue(parsed, "utm_term"));
    }

    private static string? GetValue(Dictionary<string, StringValues> parsed, string key)
    {
        return parsed.TryGetValue(key, out StringValues value) ? value.ToString() : null;
    }

    private sealed record HistoricalHit(
        string SessionId,
        DateTime CreatedUtc,
        Guid Id,
        string Path,
        string QueryString,
        string? UserAgent,
        Guid? UserId);
}
