namespace Quizymode.Api.StartupExtensions;

/// <summary>
/// #933: outside Development the API answers only requests whose Host is listed in
/// <see cref="AllowedHostsKey"/>; anything else, including a request with no Host, gets an empty 400. Only the exact
/// path <c>/health</c> is exempt, because the load balancer probes it with the container's private address as Host.
/// The root <c>AllowedHosts</c> key stays <c>*</c>: the framework's own host filter runs before any middleware and
/// cannot exempt a path, so it must never reject anything. Hosts compare case-insensitively and the port is ignored.
/// X-Forwarded-Host is not honored (#906), so the host checked is the Host header the load balancer passed on.
/// </summary>
internal static class AllowedHostCheck
{
    internal const string AllowedHostsKey = "HostFiltering:AllowedHosts";
    internal const string ExemptPath = "/health";

    /// <summary>
    /// Adds the check. Development accepts any host. In Production an empty list fails startup rather than turning the
    /// check off; in any other environment an empty list turns it off with a warning, so test hosts still answer.
    /// </summary>
    internal static WebApplication UseAllowedHostCheck(this WebApplication app)
    {
        if (app.Environment.IsDevelopment())
        {
            return app;
        }

        HashSet<string> allowedHosts = ReadAllowedHosts(app.Configuration);
        if (allowedHosts.Count == 0)
        {
            if (app.Environment.IsProduction())
            {
                throw new InvalidOperationException(
                    $"{AllowedHostsKey} is empty in Production; list the public API host names (#933).");
            }

            app.Logger.LogWarning(
                "{Key} is empty in {Environment}; the host check is off.", AllowedHostsKey, app.Environment.EnvironmentName);
            return app;
        }

        app.UseMiddleware<AllowedHostMiddleware>(allowedHosts);
        return app;
    }

    /// <summary>The configured host names without any port, compared case-insensitively.</summary>
    internal static HashSet<string> ReadAllowedHosts(IConfiguration configuration)
    {
        string[] configured = configuration.GetSection(AllowedHostsKey).Get<string[]>() ?? [];
        return configured
            .Where(static entry => !string.IsNullOrWhiteSpace(entry))
            .Select(static entry => new HostString(entry.Trim()).Host)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    internal static bool IsAllowed(HttpRequest request, IReadOnlySet<string> allowedHosts) =>
        string.Equals(request.Path.Value, ExemptPath, StringComparison.OrdinalIgnoreCase)
        || (request.Host.HasValue && allowedHosts.Contains(request.Host.Host));
}

/// <summary>Rejects a request for an unlisted or missing host with an empty 400 (#933, <see cref="AllowedHostCheck"/>).</summary>
internal sealed class AllowedHostMiddleware(RequestDelegate next, HashSet<string> allowedHosts, ILogger<AllowedHostMiddleware> logger)
{
    public Task InvokeAsync(HttpContext context)
    {
        if (AllowedHostCheck.IsAllowed(context.Request, allowedHosts))
        {
            return next(context);
        }

        // The host value is client input, so it is not logged.
        logger.LogDebug("Rejected a request for an unlisted or missing host.");
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return Task.CompletedTask;
    }
}
