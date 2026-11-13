using Quizymode.Api.Services;

namespace Quizymode.Api.Features.Admin.DailyDigest;

/// <summary>
/// Aggregate-only digest numbers (#509). A null section means "unavailable" (the query failed), which is different from zero.
/// The whole report is persisted as JSON so every send attempt renders identical text.
/// </summary>
internal sealed record DigestReport(
    string Kind,
    DateOnly ReportDate,
    string TimeZone,
    DateTime StartUtc,
    DateTime EndUtc,
    DaySummary Current,
    BaselineSummary? Baseline,
    WaitingSection? Waiting,
    DigestHealth? Health,
    List<string> PreviousDigests,
    string? NewVersion,
    DateTime ComputedUtc)
{
    public const string KindDaily = "Daily";
    public const string KindWindow = "Window";

    /// <summary>True when every section of the current window failed, so there is nothing worth sending.</summary>
    public bool AllUnavailable => Current.Visits is null && Current.Accounts is null && Current.Quizzes is null
        && Current.Sources is null && Current.Problems is null && Current.Locations is null && Waiting is null && Health is null;
}

internal sealed record DaySummary(
    VisitsSection? Visits,
    AccountsSection? Accounts,
    QuizSection? Quizzes,
    SourcesSection? Sources,
    ProblemsSection? Problems,
    LocationsSection? Locations = null);

internal sealed record VisitsSection(
    int PageViews,
    int Sessions,
    int EngagedSessions,
    int Browsers,
    int SessionsWithoutBrowserId,
    int NewBrowsers,
    int ReturningBrowsers,
    int ItemSteps);

internal sealed record AccountsSection(
    int ActiveAccounts,
    int NewAccounts,
    int AnonymousSessions,
    int ConvertedSessions,
    int AuthenticatedSessions);

internal sealed record TopicCount(string Label, int Starts);

internal sealed record QuizSection(int Starts, int Completed, int Participants, List<TopicCount> Topics);

internal sealed record SourceRow(string Name, int Sessions, int EngagedSessions, int QuizStarts, int ConvertedSessions, int NewAccounts);

/// <summary>Sources by sessions, top rows first; <paramref name="Other"/> sums the rest so the table adds up (#573).</summary>
internal sealed record SourcesSection(List<SourceRow> Top, SourceRow? Other = null);

internal sealed record LocationRow(string Name, int Sessions);

/// <summary>Top places by sessions, then the sessions of every other place and of sessions with no known place.</summary>
internal sealed record LocationBreakdown(List<LocationRow> Top, int Other, int Unknown);

internal sealed record LocationsSection(LocationBreakdown Countries, LocationBreakdown Regions);

internal sealed record ProblemsSection(
    int ErrorReports,
    int ErrorSessions,
    int ErrorUsers,
    int NewErrorGroups,
    int ProblemReports,
    int OtherFeedback,
    int PictureReports);

internal sealed record WaitingSection(
    int ItemsToReview,
    int PrivateKeywords,
    int Ideas,
    int Pictures,
    int? OldestPictureAgeDays,
    int NewFeedback);

/// <param name="Excluded">Sessions excluded from the window per traffic class (#573); null in digests persisted before it existed.</param>
internal sealed record DigestHealth(int RawPageViews, int RawEvents, ExcludedSessionCounts? Excluded = null);

/// <summary>
/// Averages of the comparison windows. <see cref="Label"/> is "7-day avg" for a daily digest or "previous window" for
/// an ad hoc window. A value is null when no comparison window had it.
/// </summary>
/// <remarks><c>RulesChangedOn</c> is set when the comparison would have spanned the traffic-rules change, so earlier days were left out (#573).</remarks>
internal sealed record BaselineSummary(string Label, int Days, int ExpectedDays, Dictionary<string, double?> Averages, DateOnly? RulesChangedOn = null);
