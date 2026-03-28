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
                    await context.HttpContext.Response.WriteAsJsonAsync(
                        new
                        {
                            title = "Too Many Requests",
                            status = StatusCodes.Status429TooManyRequests,
                            detail = "Too many feedback submissions. Please wait a few minutes and try again."
                        },
                        cancellationToken);
                }
            };

            options.AddPolicy("feedback-submissions", httpContext =>
            {
                string partitionKey = GetFeedbackPartitionKey(httpContext);
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
        });

        return builder;
    }

    private static string GetFeedbackPartitionKey(HttpContext httpContext)
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
}
