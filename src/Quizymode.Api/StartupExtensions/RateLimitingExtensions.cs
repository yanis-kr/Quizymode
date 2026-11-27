using System.Net;
using System.Net.Sockets;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    private const string GlobalRejectionMessage = "Too many requests. Please wait a moment and try again.";

    /// <summary><c>GET /items</c> pages above this size use the large-item-pages budget.</summary>
    private const int LargeItemPageThreshold = 100;

    public static WebApplicationBuilder AddRateLimitingServices(this WebApplicationBuilder builder)
    {
        builder.Services.AddOptions<RateLimitSettings>()
            .Bind(builder.Configuration.GetSection(RateLimitSettings.SectionName))
            .Validate(settings => settings.IsValid(), "Every RateLimits PermitLimit and WindowSeconds must be greater than 0.")
            .ValidateOnStart();
        builder.Services.AddOptions<QuotaSettings>()
            .Bind(builder.Configuration.GetSection(QuotaSettings.SectionName))
            .Validate(settings => settings.IsValid(), "Every Quotas value must be greater than 0.")
            .ValidateOnStart();

        builder.Services.AddRateLimiter(static _ => { });
        // Configured through DI so the limits come from the final application configuration.
        builder.Services.AddOptions<RateLimiterOptions>()
            .Configure<IOptions<RateLimitSettings>>(static (options, settings) => ConfigureRateLimiter(options, settings.Value));

        return builder;
    }

    private static void ConfigureRateLimiter(RateLimiterOptions options, RateLimitSettings settings)
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

        // AC 17.1/17.2: the global limit applies to every request in addition to any endpoint policy.
        options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
            IsExemptFromGlobalLimit(httpContext.Request)
                ? RateLimitPartition.GetNoLimiter("exempt")
                : FixedWindow(GetAuthenticatedOrTrustedIpPartitionKey(httpContext), settings.Global));
        options.OnRejected = MessageRateLimiterPolicy.Rejection(GlobalRejectionMessage);

        AddFixedWindowPolicy(options, "page-views", settings.PageViews,
            "Too many page views. Please slow down.");

        // One budget shared by every endpoint that creates or rates content.
        AddFixedWindowPolicy(options, "content-writes", settings.ContentWrites,
            "Too many changes in a short time. Please wait a few minutes and try again.");

        // Only large pages count. The two partition keys differ because a limiter is cached by its key.
        options.AddPolicy("large-item-pages", new MessageRateLimiterPolicy(
            httpContext => IsLargeItemPage(httpContext.Request)
                ? FixedWindow($"large:{GetAuthenticatedOrTrustedIpPartitionKey(httpContext)}", settings.LargeItemPages)
                : RateLimitPartition.GetNoLimiter("small"),
            "Too many large list requests. Please wait a few minutes and try again."));

        AddFixedWindowPolicy(options, "item-export", settings.ItemExport,
            "Too many exports. Please wait a few minutes and try again.");

        // Generous enough for a full study run plus signup flow; batches of up to 25 events count once.
        AddFixedWindowPolicy(options, "analytics-events", Rule(120, TimeSpan.FromMinutes(10)),
            "Too many analytics events. Please slow down.");

        // Front-end error reports (OBS-001). The SPA sends at most 10 per tab session, so this only
        // bites when an error loop or a script floods the endpoint. Keyed on the server-trusted client IP, never on a
        // client-sent X-Forwarded-For value or session id, so rotating either cannot buy a fresh budget.
        AddFixedWindowPolicy(options, "client-errors", Rule(30, TimeSpan.FromMinutes(10)),
            "Too many error reports. Please slow down.");

        // Global search (#320): anonymous and cheap, but each call can run three GIN queries. A fixed window (not
        // sliding) so the rejection carries Retry-After.
        AddFixedWindowPolicy(options, "search", Rule(120, TimeSpan.FromMinutes(1)),
            "Too many searches. Please wait a moment and try again.");

        // Topic suggestion (#322): authenticated, in-memory scoring, but the SPA calls it as the user types.
        AddFixedWindowPolicy(options, "taxonomy-suggest", Rule(60, TimeSpan.FromMinutes(1)),
            "Too many topic suggestions. Please wait a moment and try again.");

        AddFixedWindowPolicy(options, "feedback-submissions", Rule(5, TimeSpan.FromMinutes(10)),
            "Too many feedback submissions. Please wait a few minutes and try again.");

        // Study guide document uploads (AC 6.6): extraction is CPU-bound, so creates are capped per user.
        AddFixedWindowPolicy(options, "study-guide-documents", Rule(20, TimeSpan.FromHours(1)),
            "Too many study guide uploads. Please wait a while and try again.");

        // Picture uploads (AC 3.24): decoding is CPU- and memory-bound, so uploads are capped per user. In-memory per
        // instance; durable per-account quotas are #405.
        AddFixedWindowPolicy(options, "media-uploads", Rule(20, TimeSpan.FromHours(1)),
            "Too many picture uploads. Please wait a while and try again.");

        // Picture reports (#635): anonymous allowed, so a per-instance burst limit sits in front of the durable daily
        // allowance (Media:MaxReportsPerDay).
        AddFixedWindowPolicy(options, "media-reports", Rule(20, TimeSpan.FromMinutes(10)),
            "Too many picture reports. Please wait a few minutes and try again.");

        AddFixedWindowPolicy(options, "media-reads", Rule(120, TimeSpan.FromMinutes(1)),
            "Too many picture requests. Please wait a moment and try again.");

        // Flashcard "Still learning" grades queue one item per call (#251); generous for a long deck, strict for floods.
        AddFixedWindowPolicy(options, "review-queue-enqueue", Rule(300, TimeSpan.FromMinutes(10)),
            "Too many Review queue updates. Please slow down.");

        // Sign-up's display name check (AC 4.2.13): anonymous, so capped per trusted client IP.
        AddFixedWindowPolicy(options, "username-availability", Rule(30, TimeSpan.FromMinutes(10)),
            "Too many display name checks. Please wait a few minutes and try again.");
    }

    private static void AddFixedWindowPolicy(RateLimiterOptions options, string name, RateLimitRule rule, string message) =>
        options.AddPolicy(name, new MessageRateLimiterPolicy(
            httpContext => FixedWindow(GetAuthenticatedOrTrustedIpPartitionKey(httpContext), rule),
            message));

    private static RateLimitRule Rule(int permitLimit, TimeSpan window) =>
        new() { PermitLimit = permitLimit, WindowSeconds = (int)window.TotalSeconds };

    private static RateLimitPartition<string> FixedWindow(string partitionKey, RateLimitRule rule) =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey,
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = rule.PermitLimit,
                Window = TimeSpan.FromSeconds(rule.WindowSeconds),
                QueueLimit = 0,
                AutoReplenishment = true
            });

    private static bool IsExemptFromGlobalLimit(HttpRequest request) =>
        request.Path.Equals("/health", StringComparison.OrdinalIgnoreCase)
        || request.Path.Equals("/alive", StringComparison.OrdinalIgnoreCase)
        || (HttpMethods.IsOptions(request.Method) && request.Headers.ContainsKey("Access-Control-Request-Method"));

    // A value that binding rejects (for example a repeated pageSize) does not parse here either and ends as a 400.
    private static bool IsLargeItemPage(HttpRequest request) =>
        int.TryParse(request.Query["pageSize"], out int pageSize) && pageSize > LargeItemPageThreshold;

    /// <summary>
    /// The user subject when authenticated, otherwise <see cref="ConnectionInfo.RemoteIpAddress"/>, which
    /// <c>UseForwardedHeaders</c> sets from X-Forwarded-For only for hops appended by configured trusted proxies.
    /// IPv6 addresses are grouped by their /64 prefix (AC 16.3.3).
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

        IPAddress? address = httpContext.Connection.RemoteIpAddress;
        if (address is null)
        {
            return "ip:unknown";
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (address.AddressFamily != AddressFamily.InterNetworkV6)
        {
            return $"ip:{address}";
        }

        byte[] bytes = address.GetAddressBytes();
        Array.Clear(bytes, 8, 8);
        return $"ip:{new IPAddress(bytes)}/64";
    }
}
