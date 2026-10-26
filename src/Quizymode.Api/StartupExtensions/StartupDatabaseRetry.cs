using Npgsql;

namespace Quizymode.Api.StartupExtensions;

/// <summary>
/// Retries the startup migration when the database or Supavisor temporarily refuses connections (#339), e.g. the
/// session-mode EMAXCONNSESSION error while the previous container still holds slots during a deploy.
/// </summary>
internal static class StartupDatabaseRetry
{
    internal const int MaxAttempts = 6;
    internal static readonly TimeSpan BaseDelay = TimeSpan.FromSeconds(2);
    internal static readonly TimeSpan MaxDelay = TimeSpan.FromSeconds(30);

    public static async Task ExecuteAsync(
        Func<CancellationToken, Task> operation,
        ILogger logger,
        Func<TimeSpan, CancellationToken, Task> delay,
        CancellationToken cancellationToken)
    {
        for (int attempt = 1; ; attempt++)
        {
            try
            {
                await operation(cancellationToken);
                return;
            }
            catch (Exception ex) when (attempt < MaxAttempts && IsRetryable(ex))
            {
                TimeSpan wait = TimeSpan.FromSeconds(
                    Math.Min(BaseDelay.TotalSeconds * Math.Pow(2, attempt - 1), MaxDelay.TotalSeconds));
                Exception cause = RootCause(ex);
                PostgresException? pg = cause as PostgresException;
                logger.LogWarning(
                    "Database migration attempt {Attempt}/{MaxAttempts} failed with {ErrorType} {SqlState}: {Reason}; retrying in {DelaySeconds}s",
                    attempt, MaxAttempts, cause.GetType().Name, pg?.SqlState, pg?.MessageText ?? cause.Message, wait.TotalSeconds);
                await delay(wait, cancellationToken);
            }
        }
    }

    internal static bool IsRetryable(Exception ex) => ex switch
    {
        OperationCanceledException => false,
        PostgresException pg when pg.SqlState == PostgresErrorCodes.InternalError
            && pg.MessageText.Contains("EMAXCONNSESSION", StringComparison.Ordinal) => true,
        PostgresException pg => pg.IsTransient,
        NpgsqlException npg when npg.IsTransient => true,
        { InnerException: { } inner } => IsRetryable(inner),
        _ => false,
    };

    /// <summary>
    /// The database exception behind EF's transient-failure wrapper (#350), so the retry warning names the real error.
    /// Falls back to <paramref name="ex"/> when the chain holds no Npgsql exception.
    /// </summary>
    internal static Exception RootCause(Exception ex)
    {
        for (Exception? current = ex; current is not null; current = current.InnerException)
        {
            if (current is NpgsqlException)
            {
                return current;
            }
        }

        return ex;
    }
}
