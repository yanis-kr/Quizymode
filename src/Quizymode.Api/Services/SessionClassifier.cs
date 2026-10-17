using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

/// <summary>
/// Shared row-to-session classification used by every admin report that needs bounce, engagement,
/// and outcome (anonymous/converted/authenticated) numbers derived from raw <see cref="PageView"/>
/// hits. Extracted out of <c>GetPageViewSessions</c> so it and <c>GetAcquisitionReport</c> can never
/// disagree about these numbers for the same window and exclusions (TRAFFIC-122/123).
/// </summary>
internal static class SessionClassifier
{
    public const string OutcomeAnonymous = "anonymous";
    public const string OutcomeConverted = "converted";
    public const string OutcomeAuthenticated = "authenticated";

    /// <summary>One row per session: bounce is exactly one hit, engaged is 2+ distinct page paths.</summary>
    public sealed record ClassifiedSession(
        string SessionId,
        string Outcome,
        DateTime StartedUtc,
        DateTime EndedUtc,
        int PageHits,
        int DistinctPages,
        int DurationSeconds,
        string EntryPath,
        string ExitPath,
        Guid? UserId,
        string IpAddress,
        string? UserAgent,
        bool IsBot)
    {
        public bool IsBounce => PageHits == 1;

        public bool IsEngaged => DistinctPages >= 2;
    }

    /// <summary>
    /// Groups <paramref name="scope"/> into one row per session. A session is "authenticated" when
    /// its first hit was already signed in, "converted" when it started anonymous and later signed
    /// in, and "anonymous" otherwise.
    /// </summary>
    public static async Task<List<ClassifiedSession>> ClassifyAsync(
        IQueryable<PageView> scope,
        CancellationToken cancellationToken)
    {
        // Q1: one row per session. Count(Distinct) inside GroupBy translates on both
        // Npgsql and the SQLite provider used by the test fixture.
        var aggregates = await scope
            .GroupBy(pageView => pageView.SessionId)
            .Select(group => new
            {
                SessionId = group.Key,
                FirstSeenUtc = group.Min(pageView => pageView.CreatedUtc),
                LastSeenUtc = group.Max(pageView => pageView.CreatedUtc),
                PageHits = group.Count(),
                DistinctPages = group.Select(pageView => pageView.Path).Distinct().Count(),
                AuthHits = group.Sum(pageView => pageView.IsAuthenticated ? 1 : 0)
            })
            .ToListAsync(cancellationToken);

        // Q2: the first and last hit of every session, for entry/exit path and the auth
        // state the outcome classification is based on.
        var boundaryTimes = scope
            .GroupBy(pageView => pageView.SessionId)
            .Select(group => new
            {
                SessionId = group.Key,
                FirstUtc = group.Min(pageView => pageView.CreatedUtc),
                LastUtc = group.Max(pageView => pageView.CreatedUtc)
            });

        var boundaryRows = await (
            from pageView in scope
            join boundary in boundaryTimes on pageView.SessionId equals boundary.SessionId
            where pageView.CreatedUtc == boundary.FirstUtc || pageView.CreatedUtc == boundary.LastUtc
            select new
            {
                pageView.Id,
                pageView.SessionId,
                pageView.Path,
                pageView.CreatedUtc,
                pageView.IsAuthenticated,
                pageView.UserId,
                pageView.IpAddress,
                pageView.UserAgent,
                pageView.IsBot,
                boundary.FirstUtc,
                boundary.LastUtc
            }).ToListAsync(cancellationToken);

        // Two hits sharing a timestamp inside one session would otherwise produce duplicate
        // boundary rows; ordering by Id makes the pick deterministic.
        Dictionary<string, Boundary> boundaries = boundaryRows
            .GroupBy(row => row.SessionId)
            .ToDictionary(
                group => group.Key,
                group =>
                {
                    var entry = group.Where(row => row.CreatedUtc == row.FirstUtc)
                        .OrderBy(row => row.Id)
                        .First();
                    var exit = group.Where(row => row.CreatedUtc == row.LastUtc)
                        .OrderBy(row => row.Id)
                        .Last();

                    return new Boundary(
                        EntryPath: entry.Path,
                        ExitPath: exit.Path,
                        EntryAuthenticated: entry.IsAuthenticated,
                        UserId: exit.UserId ?? entry.UserId,
                        IpAddress: entry.IpAddress,
                        UserAgent: entry.UserAgent,
                        IsBot: entry.IsBot);
                });

        return aggregates
            .Where(aggregate => boundaries.ContainsKey(aggregate.SessionId))
            .Select(aggregate =>
            {
                Boundary boundary = boundaries[aggregate.SessionId];

                string outcome = boundary.EntryAuthenticated
                    ? OutcomeAuthenticated
                    : aggregate.AuthHits > 0
                        ? OutcomeConverted
                        : OutcomeAnonymous;

                return new ClassifiedSession(
                    SessionId: aggregate.SessionId,
                    Outcome: outcome,
                    StartedUtc: aggregate.FirstSeenUtc,
                    EndedUtc: aggregate.LastSeenUtc,
                    PageHits: aggregate.PageHits,
                    DistinctPages: aggregate.DistinctPages,
                    DurationSeconds: (int)Math.Round((aggregate.LastSeenUtc - aggregate.FirstSeenUtc).TotalSeconds),
                    EntryPath: boundary.EntryPath,
                    ExitPath: boundary.ExitPath,
                    UserId: boundary.UserId,
                    IpAddress: boundary.IpAddress,
                    UserAgent: boundary.UserAgent,
                    IsBot: boundary.IsBot);
            })
            .ToList();
    }

    private sealed record Boundary(
        string EntryPath,
        string ExitPath,
        bool EntryAuthenticated,
        Guid? UserId,
        string IpAddress,
        string? UserAgent,
        bool IsBot);
}
