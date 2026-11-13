using System.Globalization;
using System.Net;
using System.Text;

namespace Quizymode.Api.Features.Admin.DailyDigest;

/// <summary>
/// Renders a persisted <see cref="DigestReport"/> as an email (#509, #573): a plain-text body and an HTML body built from the
/// same <see cref="Document"/>, so both always have the same sections in the same order. The output is a pure function of the
/// report, so a retry sends the same body. Only aggregates are printed; free text (collection names, regions, sources)
/// never reaches the HTML unescaped.
/// </summary>
internal static class DailyDigestRenderer
{
    internal const string ResendSuffix = " (resent after an interrupted send)";
    internal const string TestPrefix = "[TEST] ";

    /// <summary>The plain-text body never has a line longer than this (except a link URL, which cannot be broken).</summary>
    internal const int TextWidth = 60;

    private const string Unavailable = "Unavailable";

    // Document model shared by the text and HTML renderers.
    internal abstract record Block;

    internal sealed record Para(string Text, bool Warning = false, bool Muted = false) : Block;

    /// <summary>The first column is left-aligned text, every other column is a right-aligned number.</summary>
    internal sealed record Table(string[] Header, List<string[]> Rows) : Block;

    internal sealed record Links(List<(string Label, string Url)> Items) : Block;

    internal sealed record Section(string Title, List<Block> Blocks);

    internal sealed record Document(string Heading, List<Section> Sections);

    internal static string Subject(DigestReport report, bool testSend, bool interruptedResend)
    {
        TimeZoneInfo zone = DailyDigestWindow.TryFindZone(report.TimeZone) ?? TimeZoneInfo.Utc;
        List<string> parts = [];
        if (report.Current.Visits is { } visits)
        {
            parts.Add(Count(visits.Sessions, "session"));
        }

        if (report.Current.Accounts is { } accounts)
        {
            parts.Add(Count(accounts.NewAccounts, "new account"));
        }

        if (report.Current.Quizzes is { } quizzes)
        {
            parts.Add(Count(quizzes.Starts, "quiz start"));
        }

        string title = report.Kind == DigestReport.KindDaily
            ? $"Quizymode daily ({report.TimeZone}, {report.ReportDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)})"
            : $"Quizymode digest ({report.TimeZone}) {Local(report.StartUtc, zone, "MMM d HH:mm")} to {Local(report.EndUtc, zone, "MMM d HH:mm")}";
        string subject = parts.Count == 0 ? title : $"{title}: {string.Join(", ", parts)}";
        return (testSend ? TestPrefix : string.Empty) + subject + (interruptedResend ? ResendSuffix : string.Empty);
    }

    /// <summary>The plain-text email body.</summary>
    internal static string Body(DigestReport report, string? adminBaseUrl) => RenderText(BuildDocument(report, adminBaseUrl));

    /// <summary>The HTML email body: one column, at most 600px wide, inline styles and no media queries.</summary>
    internal static string Html(DigestReport report, string? adminBaseUrl) => RenderHtml(BuildDocument(report, adminBaseUrl));

    internal static Document BuildDocument(DigestReport report, string? adminBaseUrl)
    {
        TimeZoneInfo zone = DailyDigestWindow.TryFindZone(report.TimeZone) ?? TimeZoneInfo.Utc;
        string heading = report.Kind == DigestReport.KindDaily
            ? $"Quizymode daily | {report.ReportDate.ToString("ddd MMM d, yyyy", CultureInfo.InvariantCulture)} ({report.TimeZone})"
            : $"Quizymode digest | {Local(report.StartUtc, zone, "yyyy-MM-dd HH:mm")} to {Local(report.EndUtc, zone, "yyyy-MM-dd HH:mm")} ({report.TimeZone})";

        return new Document(
            heading,
            [
                SummarySection(report),
                AudienceSection(report),
                LearningSection(report),
                SourcesSectionOf(report),
                LocationsSectionOf(report),
                AttentionSection(report, adminBaseUrl),
                ReliabilitySection(report),
                FooterSection(report)
            ]);
    }

    private static Section SummarySection(DigestReport report)
    {
        List<Block> blocks = [];
        if (report.Current.Visits is { } visits)
        {
            string quizzes = report.Current.Quizzes is { } q ? $"{q.Completed} quizzes completed" : "quizzes unavailable";
            blocks.Add(new Para($"{visits.Sessions} sessions, {visits.EngagedSessions} engaged (2+ pages), {quizzes}"));
        }
        else
        {
            blocks.Add(new Para(Unavailable));
        }

        return new Section("Summary", blocks);
    }

    private static Section AudienceSection(DigestReport report)
    {
        List<Block> blocks = [];
        BaselineSummary? baseline = report.Baseline;
        if (report.Current.Visits is { } v)
        {
            List<string[]> rows =
            [
                MetricRow("Sessions", v.Sessions, "sessions", baseline),
                MetricRow("Browsers (est.)", v.Browsers, "browsers", baseline)
            ];
            if (report.Current.Accounts is { } accounts)
            {
                rows.Add(MetricRow("Accounts active", accounts.ActiveAccounts, "activeAccounts", baseline));
            }

            rows.Add(MetricRow("Page views", v.PageViews, "pageViews", baseline));
            if (report.Current.Accounts is { } newAccounts)
            {
                rows.Add(MetricRow("New accounts", newAccounts.NewAccounts, "newAccounts", baseline));
            }

            blocks.Add(new Table(MetricHeader(report), rows));
            if (baseline is not null)
            {
                blocks.Add(new Para(
                    baseline.Days == 0
                        ? "No comparison days are available yet."
                        : $"Average of {baseline.Days} {(baseline.Days == 1 ? "day" : "days")}.",
                    Muted: true));
            }

            blocks.Add(new Para(
                "Session = one tab visit. Engaged = 2 or more distinct pages in a session. Browser (est.) = one local browser id, not a person. Account = one signed-in user.",
                Muted: true));
        }
        else
        {
            blocks.Add(new Para(Unavailable));
        }

        return new Section("Audience", blocks);
    }

    private static Section LearningSection(DigestReport report)
    {
        List<Block> blocks = [];
        BaselineSummary? baseline = report.Baseline;
        if (report.Current.Quizzes is { } q)
        {
            blocks.Add(new Table(
                MetricHeader(report),
                [
                    MetricRow("Quiz starts", q.Starts, "quizStarts", baseline),
                    ValueRow("Completed", Completion(q.Completed, q.Starts).Trim(), baseline),
                    ValueRow("Participants (browsers)", q.Participants.ToString(CultureInfo.InvariantCulture), baseline)
                ]));
            if (q.Topics.Count > 0)
            {
                blocks.Add(new Para($"Top topics: {string.Join(", ", q.Topics.Select(topic => $"{topic.Label} ({topic.Starts})"))}"));
            }
        }
        else
        {
            blocks.Add(new Para(Unavailable));
        }

        return new Section("Learning", blocks);
    }

    private static Section SourcesSectionOf(DigestReport report)
    {
        List<Block> blocks = [];
        if (report.Current.Sources is { } sources)
        {
            List<SourceRow> rows = sources.Top.Where(row => row.Sessions > 0).ToList();
            if (sources.Other is { Sessions: > 0 } other)
            {
                rows.Add(other);
            }

            if (rows.Count == 0)
            {
                blocks.Add(new Para("No traffic sources recorded."));
            }
            else
            {
                blocks.Add(new Table(
                    ["Source", "Sessions", "Engaged", "Quiz starts"],
                    rows.Select(row => new[] { row.Name, Number(row.Sessions), Number(row.EngagedSessions), Number(row.QuizStarts) }).ToList()));
            }
        }
        else
        {
            blocks.Add(new Para(Unavailable));
        }

        return new Section("Traffic sources", blocks);
    }

    private static Section LocationsSectionOf(DigestReport report)
    {
        List<Block> blocks = [];
        if (report.Current.Locations is { } locations)
        {
            blocks.Add(LocationTable("Country", locations.Countries));
            blocks.Add(LocationTable("Region", locations.Regions));
            blocks.Add(new Para("Approximate, from IP geolocation. Local and missing locations are Unknown.", Muted: true));
        }
        else
        {
            blocks.Add(new Para(Unavailable));
        }

        return new Section("Visitor locations (approximate)", blocks);
    }

    private static Block LocationTable(string header, LocationBreakdown breakdown)
    {
        List<string[]> rows = breakdown.Top.Select(row => new[] { row.Name, Number(row.Sessions) }).ToList();
        if (breakdown.Other > 0)
        {
            rows.Add(["Other", Number(breakdown.Other)]);
        }

        if (breakdown.Unknown > 0)
        {
            rows.Add(["Unknown", Number(breakdown.Unknown)]);
        }

        return rows.Count == 0
            ? new Para($"No {header.ToLowerInvariant()} data.", Muted: true)
            : new Table([header, "Sessions"], rows);
    }

    private static Section AttentionSection(DigestReport report, string? adminBaseUrl)
    {
        List<Block> blocks = [];
        bool anyUnavailable = report.Waiting is null || report.Current.Problems is null;
        bool feedbackLine = false;
        bool errorLine = false;
        List<string> lines = [];
        if (report.Waiting is { } w)
        {
            AddIfPositive(lines, "Items to review", w.ItemsToReview);
            AddIfPositive(lines, "Private keywords to review", w.PrivateKeywords);
            AddIfPositive(lines, "Ideas to moderate", w.Ideas);
            if (w.Pictures > 0)
            {
                string oldest = w.OldestPictureAgeDays is { } days ? $" (oldest {days} d)" : string.Empty;
                lines.Add($"Pictures waiting: {w.Pictures}{oldest}");
            }
        }

        int newYesterday = report.Current.Problems is { } pr ? pr.ProblemReports + pr.OtherFeedback : 0;
        int backlog = report.Waiting?.NewFeedback ?? 0;
        if (backlog > 0 || newYesterday > 0)
        {
            lines.Add($"Open feedback backlog now: {backlog}");
            lines.Add($"New feedback yesterday: {newYesterday}");
            feedbackLine = true;
        }

        if (report.Current.Problems is { } p)
        {
            if (p.ErrorReports > 0)
            {
                lines.Add($"Front-end error reports: {p.ErrorReports} in {Count(p.ErrorSessions, "session")}");
                errorLine = true;
            }

            AddIfPositive(lines, "Picture reports", p.PictureReports);
        }

        if (lines.Count > 0)
        {
            blocks.AddRange(lines.Select(line => (Block)new Para(line)));
        }
        else if (!anyUnavailable)
        {
            blocks.Add(new Para("Nothing needs attention today."));
        }
        else
        {
            blocks.Add(new Para("Some counts are unavailable. See Reliability."));
        }

        string? baseUrl = ValidBaseUrl(adminBaseUrl);
        if (baseUrl is not null)
        {
            List<(string Label, string Url)> links = [("Overview", $"{baseUrl}/admin"), ("Traffic", $"{baseUrl}/admin/page-views")];
            if (errorLine)
            {
                links.Add(("Client errors", $"{baseUrl}/admin/client-errors"));
            }

            if (feedbackLine)
            {
                links.Add(("Feedback", $"{baseUrl}/admin/feedback"));
            }

            blocks.Add(new Links(links));
        }

        return new Section("Needs your attention", blocks);
    }

    private static Section ReliabilitySection(DigestReport report)
    {
        List<Block> blocks = [];
        if (report.Health is { } health)
        {
            if (health.RawPageViews == 0)
            {
                blocks.Add(new Para("WARNING: No page hits of any kind were recorded. Tracking or the app may have been down, so zeros above may mean missing data.", Warning: true));
            }
            else if ((report.Current.Visits?.ItemSteps ?? 0) > 0 && health.RawEvents == 0)
            {
                blocks.Add(new Para("WARNING: Study activity was seen but no events were recorded, so study events may be missing.", Warning: true));
            }
        }

        List<string> unavailable = [];
        if (report.Current.Visits is null || report.Current.Accounts is null)
        {
            unavailable.Add("audience");
        }

        if (report.Current.Quizzes is null)
        {
            unavailable.Add("learning");
        }

        if (report.Current.Sources is null)
        {
            unavailable.Add("traffic sources");
        }

        if (report.Current.Locations is null)
        {
            unavailable.Add("visitor locations");
        }

        if (report.Waiting is null || report.Current.Problems is null)
        {
            unavailable.Add("needs your attention");
        }

        if (report.Health is null)
        {
            unavailable.Add("raw counts");
        }

        if (unavailable.Count > 0)
        {
            blocks.Add(new Para($"Unavailable: {string.Join(", ", unavailable)}.", Warning: true));
        }

        if (blocks.Count == 0)
        {
            blocks.Add(new Para("No reliability issues."));
        }

        return new Section("Reliability", blocks);
    }

    private static Section FooterSection(DigestReport report)
    {
        List<Block> blocks = [];
        if (report.Health is { } h)
        {
            blocks.Add(new Para($"Raw: {h.RawPageViews} page hits, {h.RawEvents} events.", Muted: true));
            int audience = report.Current.Visits?.Sessions ?? 0;
            string sessions = report.Current.Visits is null ? "audience unavailable" : $"audience {audience}";
            if (h.Excluded is { } excluded)
            {
                string unsplit = excluded.InternalUnsplit > 0 ? $", internal (unsplit) {excluded.InternalUnsplit}" : string.Empty;
                blocks.Add(new Para(
                    $"Sessions by class: {sessions}. Excluded: maintainer {excluded.Maintainer}, automated {excluded.Automated}, known bots {excluded.KnownBot}{unsplit}.",
                    Muted: true));
            }
            else
            {
                blocks.Add(new Para($"Sessions by class: {sessions}. Excluded counts were not recorded for this digest.", Muted: true));
            }
        }
        else
        {
            blocks.Add(new Para("Raw counts and excluded sessions: unavailable.", Muted: true));
        }

        blocks.Add(new Para($"UTC window: {report.StartUtc:yyyy-MM-dd HH:mm} to {report.EndUtc:yyyy-MM-dd HH:mm}. Days are {report.TimeZone} calendar days.", Muted: true));
        if (report.NewVersion is not null)
        {
            blocks.Add(new Para($"Version first seen in this window: {report.NewVersion}", Muted: true));
        }

        if (report.Baseline?.RulesChangedOn is { } changed)
        {
            blocks.Add(new Para($"Traffic rules changed on {changed.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)}. Earlier days are not in the average.", Muted: true));
        }

        if (report.Kind == DigestReport.KindDaily)
        {
            blocks.Add(new Para(
                report.PreviousDigests.Count == 0
                    ? "Previous digests: all sent."
                    : $"Previous digests not sent: {string.Join(", ", report.PreviousDigests)}",
                Muted: true));
        }

        return new Section("About this digest", blocks);
    }

    private static string[] MetricHeader(DigestReport report) =>
        report.Baseline is null
            ? ["Metric", report.Kind == DigestReport.KindDaily ? "Yesterday" : "This window"]
            : ["Metric", report.Kind == DigestReport.KindDaily ? "Yesterday" : "This window", report.Baseline.Label];

    private static string[] MetricRow(string label, int value, string key, BaselineSummary? baseline) =>
        baseline is null
            ? [label, Number(value)]
            : [label, Number(value), Format(baseline.Averages.GetValueOrDefault(key))];

    /// <summary>A row whose comparison cell is a dash: the value has no baseline average.</summary>
    private static string[] ValueRow(string label, string value, BaselineSummary? baseline) =>
        baseline is null ? [label, value] : [label, value, "-"];

    private static void AddIfPositive(List<string> lines, string label, int value)
    {
        if (value > 0)
        {
            lines.Add($"{label}: {value}");
        }
    }

    private static string? ValidBaseUrl(string? adminBaseUrl)
    {
        string? baseUrl = string.IsNullOrWhiteSpace(adminBaseUrl) ? null : adminBaseUrl.Trim().TrimEnd('/');
        return baseUrl is not null && Uri.TryCreate(baseUrl, UriKind.Absolute, out Uri? uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)
            ? baseUrl
            : null;
    }

    // Plain text

    private static string RenderText(Document document)
    {
        StringBuilder text = new();
        foreach (string line in Wrap(document.Heading, TextWidth))
        {
            text.AppendLine(line);
        }

        foreach (Section section in document.Sections)
        {
            text.AppendLine();
            text.AppendLine(section.Title);
            foreach (Block block in section.Blocks)
            {
                switch (block)
                {
                    case Para para:
                        foreach (string line in Wrap(para.Text, TextWidth - 2))
                        {
                            text.AppendLine("  " + line);
                        }

                        break;
                    case Table table:
                        foreach (string line in TextTable(table))
                        {
                            text.AppendLine(line);
                        }

                        break;
                    case Links links:
                        foreach ((string label, string url) in links.Items)
                        {
                            text.AppendLine($"  {label}:");
                            text.AppendLine($"    {url}");
                        }

                        break;
                }
            }
        }

        return text.ToString();
    }

    private static List<string> TextTable(Table table)
    {
        int columns = table.Header.Length;
        int[] widths = new int[columns];
        for (int column = 1; column < columns; column++)
        {
            widths[column] = Math.Max(table.Header[column].Length, table.Rows.Max(row => row[column].Length));
        }

        int gaps = 2 * (columns - 1);
        int numbersWidth = widths.Sum() + gaps;
        int firstWidth = Math.Min(
            Math.Max(table.Header[0].Length, table.Rows.Max(row => row[0].Length)),
            Math.Max(8, TextWidth - 2 - numbersWidth));
        widths[0] = firstWidth;

        string Line(string[] cells)
        {
            StringBuilder line = new("  ");
            line.Append(Truncate(cells[0], firstWidth).PadRight(firstWidth));
            for (int column = 1; column < columns; column++)
            {
                line.Append("  ").Append(cells[column].PadLeft(widths[column]));
            }

            return line.ToString();
        }

        List<string> lines = [Line(table.Header)];
        lines.AddRange(table.Rows.Select(Line));
        return lines;
    }

    private static string Truncate(string value, int width) =>
        value.Length <= width ? value : value[..Math.Max(1, width - 3)] + "...";

    private static List<string> Wrap(string text, int width)
    {
        List<string> lines = [];
        StringBuilder current = new();
        foreach (string word in text.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if (current.Length > 0 && current.Length + 1 + word.Length > width)
            {
                lines.Add(current.ToString());
                current.Clear();
            }

            if (current.Length > 0)
            {
                current.Append(' ');
            }

            current.Append(word);
        }

        if (current.Length > 0)
        {
            lines.Add(current.ToString());
        }

        return lines;
    }

    // HTML

    private const string Font = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

    private static string RenderHtml(Document document)
    {
        StringBuilder html = new();
        html.Append("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">")
            .Append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">")
            .Append("<title>").Append(Encode(document.Heading)).Append("</title></head>")
            .Append($"<body style=\"margin:0;padding:0;background:#f3f4f6;{Font}color:#111827;\">")
            .Append("<div style=\"max-width:600px;margin:0 auto;padding:16px;background:#ffffff;box-sizing:border-box;\">")
            .Append($"<h1 style=\"margin:0 0 8px 0;font-size:20px;line-height:1.3;{Font}\">").Append(Encode(document.Heading)).Append("</h1>");

        foreach (Section section in document.Sections)
        {
            html.Append($"<h2 style=\"margin:20px 0 6px 0;padding-top:12px;border-top:1px solid #e5e7eb;font-size:16px;line-height:1.3;{Font}\">")
                .Append(Encode(section.Title)).Append("</h2>");
            foreach (Block block in section.Blocks)
            {
                switch (block)
                {
                    case Para para:
                        string color = para.Warning ? "#b91c1c" : para.Muted ? "#6b7280" : "#111827";
                        string size = para.Muted ? "13px" : "15px";
                        html.Append($"<p style=\"margin:4px 0;font-size:{size};line-height:1.45;color:{color};{Font}\">")
                            .Append(Encode(para.Text)).Append("</p>");
                        break;
                    case Table table:
                        HtmlTable(html, table);
                        break;
                    case Links links:
                        html.Append("<p style=\"margin:8px 0;font-size:15px;line-height:1.6;\">");
                        html.Append(string.Join(" | ", links.Items.Select(item =>
                            $"<a href=\"{Encode(item.Url)}\" style=\"color:#1d4ed8;\">{Encode(item.Label)}</a>")));
                        html.Append("</p>");
                        break;
                }
            }
        }

        html.Append("</div></body></html>");
        return html.ToString();
    }

    private static void HtmlTable(StringBuilder html, Table table)
    {
        html.Append($"<table role=\"presentation\" style=\"width:100%;border-collapse:collapse;margin:6px 0;{Font}font-size:14px;\">");
        html.Append("<tr>");
        for (int column = 0; column < table.Header.Length; column++)
        {
            html.Append($"<th style=\"text-align:{(column == 0 ? "left" : "right")};padding:4px 4px;border-bottom:1px solid #d1d5db;font-weight:600;color:#374151;\">")
                .Append(Encode(table.Header[column])).Append("</th>");
        }

        html.Append("</tr>");
        foreach (string[] row in table.Rows)
        {
            html.Append("<tr>");
            for (int column = 0; column < row.Length; column++)
            {
                html.Append($"<td style=\"text-align:{(column == 0 ? "left" : "right")};padding:4px 4px;border-bottom:1px solid #f3f4f6;word-break:break-word;\">")
                    .Append(Encode(row[column])).Append("</td>");
            }

            html.Append("</tr>");
        }

        html.Append("</table>");
    }

    /// <summary>Every interpolated value goes through this: collection names, regions and source labels are untrusted text.</summary>
    internal static string Encode(string value) => WebUtility.HtmlEncode(value);

    private static string Number(int value) => value.ToString(CultureInfo.InvariantCulture);

    private static string Format(double? value) =>
        value is { } number ? number.ToString("0.0", CultureInfo.InvariantCulture) : "-";

    /// <summary>"x of y", with a percentage only when the base is at least 20. Never a change against the baseline.</summary>
    internal static string Completion(int completed, int started)
    {
        string text = $"{completed} of {started}";
        if (started >= 20)
        {
            text += $" ({Math.Round(completed * 100.0 / started, 0, MidpointRounding.AwayFromZero).ToString("0", CultureInfo.InvariantCulture)}%)";
        }

        return text.PadLeft(12);
    }

    private static string Count(int value, string noun) =>
        $"{value.ToString(CultureInfo.InvariantCulture)} {noun}{(value == 1 ? string.Empty : "s")}";

    private static string Local(DateTime utc, TimeZoneInfo zone, string format) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), zone).ToString(format, CultureInfo.InvariantCulture);
}
