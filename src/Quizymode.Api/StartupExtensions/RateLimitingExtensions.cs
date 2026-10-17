using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddRateLimitingServices(this WebApplicationBuilder builder)
    {
        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = static async (context, cancellationToken) =>
            {
                if (!context.HttpContext.Response.HasStarted)
                {
                    string detail = GetRejectionDetail(context.HttpContext.Request.Path);
                    await context.HttpContext.Response.WriteAsJsonAsync(
                        new
                        {
                            title = "Too Many Requests",
                            status = StatusCodes.Status429TooManyRequests,
                            detail
                        },
                        cancellationToken);
                }
            };

            // Generous enough for a full study run plus signup flow; batches of up to 25 events count once.
            options.AddPolicy("analytics-events", httpContext =>
            {
                string partitionKey = GetAuthenticatedOrIpPartitionKey(httpContext);
                return RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey,
                    static _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 120,
                        Window = TimeSpan.FromMinutes(10),
                        QueueLimit = 0,
                        AutoReplenishment = true
                    });
            });

            // Front-end error reports (OBS-001). The SPA sends at most 10 per tab session, so this only
            // bites when an error loop or a script floods the endpoint.
            options.AddPolicy("client-errors", httpContext =>
            {
                // Keyed on the server-trusted client IP, never on a client-sent X-Forwarded-For value
                // or session id, so rotating either cannot buy a fresh budget.
                string partitionKey = GetAuthenticatedOrTrustedIpPartitionKey(httpContext);
                return RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey,
                    static _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 30,
                        Window = TimeSpan.FromMinutes(10),
                        QueueLimit = 0,
                        AutoReplenishment = true
                    });
            });

            options.AddPolicy("feedback-submissions", httpContext =>
            {
                string partitionKey = GetAuthenticatedOrIpPartitionKey(httpContext);
                return RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey,
                    static _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 5,
                        Window = TimeSpan.FromMinutes(10),
                        QueueLimit = 0,
                        AutoReplenishment = true
                    });
            });

            // AI study guide uploads (one paid LLM call each). Duplicate text is free on the server, but still counts here.
            options.AddPolicy("study-guide-uploads", httpContext =>
            {
                string partitionKey = GetAuthenticatedOrTrustedIpPartitionKey(httpContext);
                return RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey,
                    static _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 10,
                        Window = TimeSpan.FromHours(1),
                        QueueLimit = 0,
                        AutoReplenishment = true
                    });
            });

            options.AddPolicy("ideas-create", httpContext =>
            {
                string partitionKey = GetAuthenticatedOrIpPartitionKey(httpContext);
                return RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey,
                    static _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 2,
                        Window = TimeSpan.FromMinutes(10),
                        QueueLimit = 0,
                        AutoReplenishment = true
                    });
            });

            options.AddPolicy("ideas-comments", httpContext =>
            {
                string partitionKey = GetAuthenticatedOrIpPartitionKey(httpContext);
                return RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey,
                    static _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 10,
                        Window = TimeSpan.FromMinutes(10),
                        QueueLimit = 0,
                        AutoReplenishment = true
                    });
            });

            options.AddPolicy("ideas-ratings", httpContext =>
            {
                string partitionKey = GetAuthenticatedOrIpPartitionKey(httpContext);
                return RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey,
                    static _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 60,
                        Window = TimeSpan.FromMinutes(10),
                        QueueLimit = 0,
                        AutoReplenishment = true
                    });
            });
        });

        return builder;
    }

    private static string GetAuthenticatedOrIpPartitionKey(HttpContext httpContext)
    {
        ClaimsPrincipal user = httpContext.User;
        if (user.Identity?.IsAuthenticated == true)
        {
            string? subject = user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrWhiteSpace(subject))
            {
                return $"user:{subject}";
            }
        }

        string? forwardedFor = httpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwardedFor))
        {
            string[] ips = forwardedFor.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (ips.Length > 0)
            {
                return $"ip:{ips[0]}";
            }
        }

        string ipAddress = httpContext.Connection.RemoteIpAddress?.ToString() ?? "anonymous";
        return $"ip:{ipAddress}";
    }

    /// <summary>
    /// The user subject when authenticated, otherwise <see cref="ConnectionInfo.RemoteIpAddress"/>, which
    /// <c>UseForwardedHeaders</c> sets from X-Forwarded-For only for hops appended by configured trusted proxies.
    /// </summary>
    internal static string GetAuthenticatedOrTrustedIpPartitionKey(HttpContext httpContext)
    {
        ClaimsPrincipal user = httpContext.User;
        if (user.Identity?.IsAuthenticated == true)
        {
            string? subject = user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrWhiteSpace(subject))
            {
                return $"user:{subject}";
            }
        }

        return $"ip:{httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"}";
    }

    private static string GetRejectionDetail(PathString requestPath)
    {
        string path = requestPath.Value ?? string.Empty;
        if (path.EndsWith("/analytics/events", StringComparison.OrdinalIgnoreCase))
        {
            return "Too many analytics events. Please slow down.";
        }

        if (path.EndsWith("/client-errors", StringComparison.OrdinalIgnoreCase))
        {
            return "Too many error reports. Please slow down.";
        }

        if (path.EndsWith("/study-guide-uploads", StringComparison.OrdinalIgnoreCase))
        {
            return "Too many study guide uploads. Please wait a while and try again.";
        }

        if (path.Contains("/ideas/", StringComparison.OrdinalIgnoreCase) && path.EndsWith("/comments", StringComparison.OrdinalIgnoreCase))
        {
            return "Too many idea comments. Please wait a few minutes and try again.";
        }

        if (path.Contains("/ideas/", StringComparison.OrdinalIgnoreCase) && path.EndsWith("/rating", StringComparison.OrdinalIgnoreCase))
        {
            return "Too many idea ratings. Please slow down and try again shortly.";
        }

        if (path.EndsWith("/ideas", StringComparison.OrdinalIgnoreCase))
        {
            return "Too many idea submissions. Please wait a few minutes and try again.";
        }

        return "Too many feedback submissions. Please wait a few minutes and try again.";
    }
}
