namespace Quizymode.Api.Services.Startup;

/// <summary>
/// While the <see cref="StartupGate"/> is closed, every request except the health probes gets 503 with
/// <c>Retry-After</c> (#732). The probes bypass the gate so Kestrel can report liveness and readiness at once.
/// </summary>
internal sealed class StartupGateMiddleware(RequestDelegate next, StartupGate gate)
{
    internal const int RetryAfterSeconds = 5;

    public Task InvokeAsync(HttpContext context)
    {
        if (gate.IsOpen || IsProbe(context.Request.Path))
        {
            return next(context);
        }

        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        context.Response.Headers.RetryAfter = RetryAfterSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return Task.CompletedTask;
    }

    private static bool IsProbe(PathString path) =>
        path.StartsWithSegments("/health") || path.StartsWithSegments("/alive");
}
