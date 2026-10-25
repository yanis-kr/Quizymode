using Serilog.Core;
using Serilog.Events;

namespace Quizymode.Api.StartupExtensions;

/// <summary>
/// Global search sends the user's text in <c>?q=</c>, and ASP.NET Core's request logs ("Request starting ...",
/// "Request finished ...") print the query string. This enricher replaces the <c>QueryString</c> property of any
/// log event for the <c>/search</c> path, so query text never reaches the console or Loki sinks.
/// </summary>
internal sealed class SearchQueryLogRedactor : ILogEventEnricher
{
    internal const string Redacted = "?[redacted]";

    public static readonly SearchQueryLogRedactor Instance = new();

    public void Enrich(LogEvent logEvent, ILogEventPropertyFactory propertyFactory)
    {
        if (!logEvent.Properties.TryGetValue("QueryString", out LogEventPropertyValue? query)
            || query is not ScalarValue { Value: string queryString }
            || queryString.Length == 0)
        {
            return;
        }

        if (!logEvent.Properties.TryGetValue("Path", out LogEventPropertyValue? path)
            || path is not ScalarValue { Value: string pathValue }
            || !IsSearchPath(pathValue))
        {
            return;
        }

        logEvent.AddOrUpdateProperty(propertyFactory.CreateProperty("QueryString", Redacted));
    }

    private static bool IsSearchPath(string path)
    {
        string trimmed = path.TrimEnd('/');
        return string.Equals(trimmed, "/search", StringComparison.OrdinalIgnoreCase);
    }
}
