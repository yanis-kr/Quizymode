using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Quizymode.Api.StartupExtensions;

/// <summary>
/// A named rate-limit policy with its own rejection message. ASP.NET calls <see cref="OnRejected"/> only when the endpoint
/// policy refused the request; a global-limiter refusal goes to <c>RateLimiterOptions.OnRejected</c>.
/// </summary>
internal sealed class MessageRateLimiterPolicy(
    Func<HttpContext, RateLimitPartition<string>> partition,
    string message) : IRateLimiterPolicy<string>
{
    public Func<OnRejectedContext, CancellationToken, ValueTask>? OnRejected { get; } = Rejection(message);

    public RateLimitPartition<string> GetPartition(HttpContext httpContext) => partition(httpContext);

    /// <summary>429 ProblemDetails with <paramref name="message"/> and, when the limiter reports it, <c>Retry-After</c>.</summary>
    internal static Func<OnRejectedContext, CancellationToken, ValueTask> Rejection(string message) =>
        async (context, _) =>
        {
            if (context.HttpContext.Response.HasStarted)
            {
                return;
            }

            if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out TimeSpan retryAfter))
            {
                context.HttpContext.Response.Headers.RetryAfter =
                    ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
            }

            context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            await Results.Problem(
                    title: "Too Many Requests",
                    detail: message,
                    type: "https://tools.ietf.org/html/rfc6585#section-4",
                    statusCode: StatusCodes.Status429TooManyRequests)
                .ExecuteAsync(context.HttpContext);
        };
}
