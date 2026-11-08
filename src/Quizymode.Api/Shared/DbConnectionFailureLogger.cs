using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Quizymode.Api.Shared;

/// <summary>
/// Logs database connection failures with the exception type, message, inner cause and RequestId.
/// The connection string and credentials are never logged (#490).
/// </summary>
internal sealed class DbConnectionFailureLogger(
    IHttpContextAccessor httpContextAccessor,
    ILogger<DbConnectionFailureLogger> logger) : DbConnectionInterceptor
{
    public override void ConnectionFailed(DbConnection connection, ConnectionErrorEventData eventData)
    {
        Log(eventData);
        base.ConnectionFailed(connection, eventData);
    }

    public override Task ConnectionFailedAsync(
        DbConnection connection,
        ConnectionErrorEventData eventData,
        CancellationToken cancellationToken = default)
    {
        Log(eventData);
        return base.ConnectionFailedAsync(connection, eventData, cancellationToken);
    }

    private void Log(ConnectionErrorEventData eventData)
    {
        Exception exception = eventData.Exception;
        string? requestId = httpContextAccessor.HttpContext?.TraceIdentifier;
        logger.LogWarning(
            "Database connection failed. ExceptionType={ExceptionType} Message={ExceptionMessage} InnerType={InnerType} InnerMessage={InnerMessage} RequestId={RequestId}",
            exception.GetType().FullName,
            exception.Message,
            exception.InnerException?.GetType().FullName,
            exception.InnerException?.Message,
            requestId);
    }
}
