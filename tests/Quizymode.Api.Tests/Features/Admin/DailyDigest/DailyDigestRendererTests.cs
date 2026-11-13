using System.Text.RegularExpressions;
using FluentAssertions;
using Quizymode.Api.Features.Admin.DailyDigest;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin.DailyDigest;

/// <summary>#573: the digest renders the same eight sections, in order, as plain text and as HTML.</summary>
public sealed class DailyDigestRendererTests
{
    private const string AdminUrl = "https://admin.example.test";

    private static readonly string[] SectionTitles =
    [
        "Summary", "Audience", "Learning", "Traffic sources", "Visitor locations (approximate)",
        "Needs your attention", "Reliability", "About this digest"
    ];

    private static DigestReport Report(
        DaySummary? current = null,
        WaitingSection? waiting = null,
        DigestHealth? health = null,
        BaselineSummary? baseline = null,
        List<string>? previous = null) => new(
        DigestReport.KindDaily,
        new DateOnly(2026, 11, 9),
        "America/Chicago",
        new DateTime(2026, 11, 9, 6, 0, 0, DateTimeKind.Utc),
        new DateTime(2026, 11, 10, 6, 0, 0, DateTimeKind.Utc),
        current ?? Day(),
        baseline,
        waiting ?? new WaitingSection(0, 0, 0, 0, null, 0),
        health ?? new DigestHealth(264, 90, new ExcludedSessionCounts(2, 3, 4, 0)),
        previous ?? [],
        null,
        new DateTime(2026, 11, 10, 14, 0, 0, DateTimeKind.Utc));

    private static DaySummary Day(
        SourcesSection? sources = null,
        LocationsSection? locations = null,
        ProblemsSection? problems = null,
        QuizSection? quizzes = null) => new(
        new VisitsSection(40, 29, 3, 28, 1, 20, 8, 5),
        new AccountsSection(2, 1, 20, 2, 7),
        quizzes ?? new QuizSection(4, 1, 3, [new TopicCount("geography", 2)]),
        sources ?? new SourcesSection(
            [new SourceRow("Direct / unknown", 26, 2, 3, 0, 0), new SourceRow("google.com", 3, 1, 1, 0, 0)]),
        problems ?? new ProblemsSection(0, 0, 0, 0, 0, 0, 0),
        locations ?? new LocationsSection(
            new LocationBreakdown([new LocationRow("US", 17), new LocationRow("MX", 5)], 4, 3),
            new LocationBreakdown([new LocationRow("Texas, US", 9)], 8, 12)));

    private static BaselineSummary Baseline(int days = 7, DateOnly? rulesChanged = null) => new(
        "7-day avg", days, 7,
        new Dictionary<string, double?>
        {
            ["sessions"] = 21.5, ["browsers"] = 20.0, ["activeAccounts"] = 1.5, ["pageViews"] = 30.0, ["newAccounts"] = 0.5, ["quizStarts"] = 2.0
        },
        rulesChanged);

    private static string Flat(string text) => Regex.Replace(text, @"\s+", " ");

    private static int[] OrderOf(string body) => SectionTitles.Select(title => body.IndexOf(title, StringComparison.Ordinal)).ToArray();

    [Fact]
    public void TextAndHtml_ContainTheSameEightSectionsInTheSameOrder()
    {
        DigestReport report = Report(baseline: Baseline());

        string text = DailyDigestRenderer.Body(report, AdminUrl);
        string html = DailyDigestRenderer.Html(report, AdminUrl);

        foreach (string body in new[] { text, html })
        {
            int[] positions = OrderOf(body);
            positions.Should().OnlyContain(position => position >= 0);
            positions.Should().BeInAscendingOrder();
        }
    }

    [Fact]
    public void Text_NeverExceedsSixtyColumns_ExceptLinkUrls()
    {
        DigestReport report = Report(
            Day(
                sources: new SourcesSection([new SourceRow("a-very-long-referrer-host-name.example.com", 12, 4, 2, 0, 0)], new SourceRow("Other", 3, 1, 0, 0, 0)),
                locations: new LocationsSection(
                    new LocationBreakdown([new LocationRow("United States of America and surrounding territories", 17)], 0, 0),
                    new LocationBreakdown([new LocationRow("A region with an extraordinarily long name, US", 9)], 0, 0))),
            new WaitingSection(2, 1, 3, 4, 6, 5),
            baseline: Baseline(rulesChanged: new DateOnly(2026, 11, 8)),
            previous: ["2026-11-07 missed", "2026-11-08 failed"]);

        string text = DailyDigestRenderer.Body(report, AdminUrl);

        text.Split('\n').Select(line => line.TrimEnd('\r')).Where(line => !line.Trim().StartsWith("http", StringComparison.Ordinal))
            .Should().OnlyContain(line => line.Length <= DailyDigestRenderer.TextWidth);
    }

    [Fact]
    public void Audience_ShowsYesterdayAndAverage_AverageOfNDays_AndNoPercentages()
    {
        string text = DailyDigestRenderer.Body(Report(baseline: Baseline(days: 5)), null);

        text.Should().Contain("Metric").And.Contain("Yesterday").And.Contain("7-day avg");
        text.Should().Contain("Average of 5 days.");
        text.Should().Contain("21.5");
        text.Should().NotContain("%");
        text.Should().Contain("Browsers (est.)").And.Contain("Accounts active").And.Contain("Page views").And.Contain("New accounts");
    }

    [Fact]
    public void Definitions_AreShown()
    {
        string text = Flat(DailyDigestRenderer.Body(Report(), null));

        text.Should().Contain("Engaged = 2 or more distinct pages in a session");
        text.Should().Contain("Session = one tab visit");
        text.Should().Contain("Browser (est.) = one local browser id, not a person");
        text.Should().Contain("Account = one signed-in user");
    }

    [Fact]
    public void Sources_ShowZeroRowsOmitted_OtherRow_AndTheEmptyMessage()
    {
        DigestReport withZero = Report(Day(sources: new SourcesSection(
            [new SourceRow("Direct / unknown", 5, 1, 0, 0, 0), new SourceRow("LinkedIn", 0, 0, 0, 0, 0)], new SourceRow("Other", 2, 0, 0, 0, 0))));
        string text = DailyDigestRenderer.Body(withZero, null);

        text.Should().Contain("Source").And.Contain("Sessions").And.Contain("Engaged").And.Contain("Quiz starts");
        text.Should().Contain("Direct / unknown").And.Contain("Other");
        text.Should().NotContain("LinkedIn");

        DailyDigestRenderer.Body(Report(Day(sources: new SourcesSection([]))), null).Should().Contain("No traffic sources recorded.");
    }

    [Fact]
    public void Locations_ShowTopOtherAndUnknownLast_LabelledApproximate_AndUnavailableIsNeverZeros()
    {
        string text = DailyDigestRenderer.Body(Report(), null);
        int section = text.IndexOf("Visitor locations", StringComparison.Ordinal);

        text.Should().Contain("Country").And.Contain("Region").And.Contain("Texas, US");
        text.Should().Contain("Approximate, from IP geolocation");
        text.IndexOf("Other", section, StringComparison.Ordinal).Should().BeLessThan(text.IndexOf("Unknown", section, StringComparison.Ordinal));

        DigestReport unavailable = Report(Day() with { Locations = null });
        string unavailableText = DailyDigestRenderer.Body(unavailable, null);
        int start = unavailableText.IndexOf("Visitor locations", StringComparison.Ordinal);
        string locations = unavailableText[start..unavailableText.IndexOf("Needs your attention", StringComparison.Ordinal)];
        locations.Should().Contain("Unavailable");
        locations.Should().NotContain("Unknown").And.NotContain(" 0");
    }

    [Fact]
    public void Attention_SaysNothingNeedsAttention_WhenEverythingIsEmpty_AndOmitsEmptyCategories()
    {
        DailyDigestRenderer.Body(Report(), AdminUrl).Should().Contain("Nothing needs attention today.");

        DigestReport busy = Report(
            Day(problems: new ProblemsSection(6, 3, 1, 2, 1, 1, 2)),
            new WaitingSection(0, 0, 0, 4, 6, 9));
        string text = DailyDigestRenderer.Body(busy, AdminUrl);

        text.Should().NotContain("Nothing needs attention today.");
        text.Should().Contain("Pictures waiting: 4 (oldest 6 d)");
        text.Should().Contain("Open feedback backlog now: 9").And.Contain("New feedback yesterday: 2");
        text.Should().Contain("Front-end error reports: 6 in 3 sessions").And.Contain("Picture reports: 2");
        text.Should().NotContain("Items to review").And.NotContain("Private keywords").And.NotContain("Ideas to moderate");
        text.Should().Contain($"{AdminUrl}/admin/feedback").And.Contain($"{AdminUrl}/admin/client-errors");
    }

    [Fact]
    public void AdminLinks_AreOnlyShownWhenAnAdminBaseUrlIsSet()
    {
        DailyDigestRenderer.Body(Report(), null).Should().NotContain("http");
        DailyDigestRenderer.Html(Report(), "   ").Should().NotContain("<a ");
        DailyDigestRenderer.Html(Report(), AdminUrl).Should().Contain($"href=\"{AdminUrl}/admin\"");
    }

    [Fact]
    public void Reliability_WarnsWhenNoHitsAndWhenStudyEventsAreMissing_AndSaysCleanOtherwise()
    {
        DailyDigestRenderer.Body(Report(), null).Should().Contain("No reliability issues.");

        string noHits = DailyDigestRenderer.Body(Report(health: new DigestHealth(0, 0, new ExcludedSessionCounts(0, 0, 0, 0))), null);
        Flat(noHits).Should().Contain("No page hits of any kind were recorded");
        noHits.IndexOf("WARNING", StringComparison.Ordinal).Should().BeGreaterThan(noHits.IndexOf("Reliability", StringComparison.Ordinal));

        string noEvents = DailyDigestRenderer.Body(Report(health: new DigestHealth(10, 0, null)), null);
        Flat(noEvents).Should().Contain("study events may be missing");

        DailyDigestRenderer.Body(Report(Day() with { Quizzes = null }), null).Should().Contain("Unavailable: learning.");
    }

    [Fact]
    public void EmptyAudience_WithRawHits_ShowsZeros_AndNoWarning()
    {
        // Every hit that day was excluded (for example, maintainer activity): zeros are shown, and no warning.
        DaySummary empty = new(
            new VisitsSection(0, 0, 0, 0, 0, 0, 0, 0),
            new AccountsSection(0, 0, 0, 0, 0),
            new QuizSection(0, 0, 0, []),
            new SourcesSection([]),
            new ProblemsSection(0, 0, 0, 0, 0, 0, 0),
            new LocationsSection(new LocationBreakdown([], 0, 0), new LocationBreakdown([], 0, 0)));
        string body = DailyDigestRenderer.Body(
            Report(current: empty, health: new DigestHealth(50, 20, new ExcludedSessionCounts(3, 0, 0, 0))),
            null);

        body.Should().NotContain("WARNING");
        Flat(body).Should().Contain("No reliability issues.");
        Flat(body).Should().Contain("audience 0");
    }

    [Fact]
    public void Footer_HasRawCounts_ExcludedPerClass_UtcWindow_TimezoneRulesNoteAndPreviousDigests()
    {
        DigestReport report = Report(
            baseline: Baseline(rulesChanged: new DateOnly(2026, 11, 8)),
            previous: ["2026-11-08 missed"]);

        string text = Flat(DailyDigestRenderer.Body(report, null));
        int footerStart = text.IndexOf("About this digest", StringComparison.Ordinal);
        string footer = text[footerStart..];

        footer.Should().Contain("Raw: 264 page hits, 90 events.");
        footer.Should().Contain("audience 29").And.Contain("maintainer 2").And.Contain("automated 3").And.Contain("known bots 4");
        footer.Should().Contain("UTC window: 2026-11-09 06:00 to 2026-11-10 06:00");
        footer.Should().Contain("America/Chicago calendar days");
        footer.Should().Contain("Traffic rules changed on 2026-11-08");
        footer.Should().Contain("Previous digests not sent: 2026-11-08 missed");
        // Raw counts and UTC boundaries live in the footer only.
        text[..footerStart].Should().NotContain("UTC window").And.NotContain("page hits,");
    }

    [Fact]
    public void Subject_NamesTheTimezoneAndDate()
    {
        DailyDigestRenderer.Subject(Report(), false, false)
            .Should().Be("Quizymode daily (America/Chicago, 2026-11-09): 29 sessions, 1 new account, 4 quiz starts");
    }

    [Fact]
    public void Html_IsASingleColumn_AtMostSixHundredPixels_WithNoMediaQueries()
    {
        string html = DailyDigestRenderer.Html(Report(baseline: Baseline()), AdminUrl);

        html.Should().Contain("max-width:600px");
        html.Should().Contain("<meta name=\"viewport\"");
        html.Should().NotContain("@media");
        html.Should().NotContain("<script");
        Regex.Matches(html, @"width:(\d+)px").Select(match => int.Parse(match.Groups[1].Value))
            .Should().OnlyContain(width => width <= 600);
        html.Should().NotContain("min-width");
    }

    [Fact]
    public void Html_EscapesEveryInterpolatedValue()
    {
        const string payload = "<img src=x onerror=alert(1)>";
        DigestReport report = Report(Day(
            quizzes: new QuizSection(1, 0, 1, [new TopicCount(payload, 1)]),
            sources: new SourcesSection([new SourceRow(payload, 1, 0, 0, 0, 0)]),
            locations: new LocationsSection(
                new LocationBreakdown([new LocationRow(payload, 1)], 0, 0),
                new LocationBreakdown([new LocationRow("\"><script>alert(2)</script>", 1)], 0, 0))));

        string html = DailyDigestRenderer.Html(report, AdminUrl);

        html.Should().NotContain("<img").And.NotContain("<script>alert");
        html.Should().Contain("&lt;img src=x onerror=alert(1)&gt;");
        html.Should().Contain("&lt;script&gt;alert(2)&lt;/script&gt;");
    }
}
