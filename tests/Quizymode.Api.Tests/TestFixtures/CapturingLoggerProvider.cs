using Microsoft.Extensions.Logging;

namespace Quizymode.Api.Tests.TestFixtures;

/// <summary>Captures log entries (level, exception, message) for assertions.</summary>
public sealed class CapturingLoggerProvider : ILoggerProvider
{
    private readonly List<CapturedLog> _entries = [];

    public IReadOnlyList<CapturedLog> Entries
    {
        get
        {
            lock (_entries)
            {
                return _entries.ToList();
            }
        }
    }

    public ILogger CreateLogger(string categoryName) => new CapturingLogger(this, categoryName);

    public void Dispose()
    {
    }

    public sealed record CapturedLog(LogLevel Level, string Category, string Message, Exception? Exception);

    private sealed class CapturingLogger(CapturingLoggerProvider owner, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            lock (owner._entries)
            {
                owner._entries.Add(new CapturedLog(logLevel, category, formatter(state, exception), exception));
            }
        }
    }
}
