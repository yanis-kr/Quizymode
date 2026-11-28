using Microsoft.AspNetCore.OpenApi;
using Serilog;
using Serilog.Events;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder ConfigureServices(this WebApplicationBuilder builder)
    {
        StartupLogger();
        builder.Configuration.AddEnvironmentVariables(prefix: "APP_");
        builder.AddSsmConfiguration();

        builder.AddServiceDefaults();
        builder.AddLoggingServices();
        builder.AddOpenApiServices();
        builder.AddHealthCheckServices();
        builder.AddCorsServices();
        builder.AddPostgreSqlServices();
        builder.AddRateLimitingServices();

        // Forwarded headers from the load balancer (#753) and the security headers (#906).
        builder.AddProxyAndSecurityHeaderServices();

        // Add authentication before custom services so middleware and IUserContext work
        builder.AddAuthenticationServices();
        // AC 7.8: registers the DevTest scheme only in Development with Authentication:DevTest:Enabled=true.
        builder.AddDevelopmentTestAuthentication();

        builder.AddCustomServices();
        
        // Auto-discover and register all features
        builder.AddFeatureRegistrations();

        return builder;
    }

    public static WebApplication ConfigurePipeline(this WebApplication app)
    {
        // CRITICAL: UseForwardedHeaders must be called FIRST, before any other middleware
        // that might inspect the request scheme. This ensures that Cloudflare's forwarded
        // headers (X-Forwarded-Proto, X-Forwarded-For) are processed and the request
        // scheme is correctly identified as HTTPS even though Cloudflare forwards it as HTTP.
        app.UseForwardedHeaders();

        // #906: security headers on every response, including the startup gate's 503 and error responses.
        app.UseSecurityHeaders();

        // #732: 503 + Retry-After for everything except the probes until migrations and seeding are done.
        app.UseMiddleware<Services.Startup.StartupGateMiddleware>();

        // #490: one access line per request (replaces the Hosting.Diagnostics start/finish pair).
        // Health probes are Verbose so the minimum level drops them. Query strings are never logged.
        app.UseSerilogRequestLogging(options =>
        {
            options.GetLevel = static (httpContext, _, exception) =>
            {
                string path = httpContext.Request.Path.Value ?? string.Empty;
                if (path is "/health" or "/alive")
                {
                    return LogEventLevel.Verbose;
                }

                if (exception is not null || httpContext.Response.StatusCode >= StatusCodes.Status500InternalServerError)
                {
                    return LogEventLevel.Error;
                }

                // Successful requests are Debug so the Information volume stays near the app's own lifecycle lines (#490).
                return httpContext.Response.StatusCode >= StatusCodes.Status400BadRequest
                    ? LogEventLevel.Warning
                    : LogEventLevel.Debug;
            };
        });

        if (app.Environment.IsDevelopment())
        {
            // Enable detailed exception pages in development for better debugging experience
            app.UseDeveloperExceptionPage();
            // Must be registered AFTER UseDeveloperExceptionPage so it sits inner (catches first).
            // Silently absorbs client-disconnect cancellations before DeveloperExceptionPage logs them.
            app.Use(async (ctx, next) =>
            {
                try { await next(ctx); }
                catch (OperationCanceledException) when (ctx.RequestAborted.IsCancellationRequested)
                { ctx.Response.StatusCode = 499; }
            });
            
            app.MapOpenApi("/openapi/{documentName}.json");
            app.MapOpenApi("/openapi/{documentName}.yaml");
            app.UseSwaggerUI(c =>
            {
                c.SwaggerEndpoint("/openapi/v1.json", "Quizymode API v1");
                c.RoutePrefix = "swagger";
                c.DisplayRequestDuration();
                c.EnableTryItOutByDefault();
            });
        }
        else
        {
            // Silently absorb client-disconnect cancellations in production.
            app.Use(async (ctx, next) =>
            {
                try { await next(ctx); }
                catch (OperationCanceledException) when (ctx.RequestAborted.IsCancellationRequested)
                { ctx.Response.StatusCode = 499; }
            });
        }

        app.UseHttpsRedirection();
        app.UseCors(CorsPolicyName);

        // Authentication & Authorization
        app.UseAuthentication();
        app.UseRateLimiter();
        app.UseAuthorization();

        // Upsert user record on authenticated requests
        app.UseMiddleware<Services.UserUpsertMiddleware>();

        app.MapDefaultEndpoints();
        //app.MapHealthChecks("/health");
        
        // Auto-discover and map all feature endpoints
        app.MapFeatureEndpoints();

        return app;
    }

    internal static readonly TimeSpan HstsMaxAge = TimeSpan.FromDays(365);

    /// <summary>Forwarded-header trust (<see cref="ConfigureForwardedHeaderOptions"/>) and the HSTS settings used by
    /// <see cref="UseSecurityHeaders"/>: one year, no includeSubDomains, no preload (#906).</summary>
    internal static WebApplicationBuilder AddProxyAndSecurityHeaderServices(this WebApplicationBuilder builder)
    {
        builder.Services.Configure<ForwardedHeadersOptions>(options => ConfigureForwardedHeaderOptions(
            options,
            builder.Environment.IsDevelopment(),
            builder.Configuration["ForwardedHeaders:KnownNetworks"]));

        builder.Services.AddHsts(options =>
        {
            options.MaxAge = HstsMaxAge;
            options.IncludeSubDomains = false;
            options.Preload = false;
        });

        return builder;
    }

    /// <summary>
    /// X-Forwarded-For and X-Forwarded-Proto are honored from trusted proxies; X-Forwarded-Host is not (#906), so the
    /// request host is the Host header the load balancer passed on. Development trusts loopback only (Aspire proxy).
    /// Other proxies are trusted only when configured: ForwardedHeaders:KnownNetworks is a comma-separated CIDR list.
    /// Production trusts any network because the load balancer is the sole path in (appsettings.Production.json,
    /// docs/infra/LIGHTSAIL.md). Only then does Connection.RemoteIpAddress take the hop such a proxy appended to
    /// X-Forwarded-For; a value the client sent itself is never trusted, so per-IP rate limits cannot be dodged.
    /// </summary>
    internal static void ConfigureForwardedHeaderOptions(ForwardedHeadersOptions options, bool isDevelopment, string? knownNetworks)
    {
        options.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor
            | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto;

        if (isDevelopment)
        {
            options.KnownProxies.Clear();
            options.KnownProxies.Add(System.Net.IPAddress.Loopback);
            options.KnownProxies.Add(System.Net.IPAddress.IPv6Loopback);
        }

        if (!string.IsNullOrWhiteSpace(knownNetworks))
        {
            foreach (string cidr in knownNetworks.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(cidr));
            }
        }
    }

    /// <summary>
    /// #906: every response carries exactly one <c>X-Content-Type-Options: nosniff</c> (set when the response starts,
    /// so an endpoint that sets it too still sends one value). Outside Development, HTTPS responses also carry
    /// <c>Strict-Transport-Security</c> with a one-year max-age (<see cref="HstsMaxAge"/>); plain HTTP, such as the
    /// load balancer's internal health probe, does not.
    /// </summary>
    internal static WebApplication UseSecurityHeaders(this WebApplication app)
    {
        app.Use(static (context, next) =>
        {
            HttpResponse response = context.Response;
            response.OnStarting(static state =>
            {
                ((HttpResponse)state).Headers.XContentTypeOptions = "nosniff";
                return Task.CompletedTask;
            }, response);
            return next(context);
        });

        if (!app.Environment.IsDevelopment())
        {
            app.UseHsts();
            app.UseUnhandledExceptionAs500();
        }

        return app;
    }

    /// <summary>
    /// #906: Kestrel answers an unhandled exception with its own 500 after resetting every header and without running
    /// OnStarting, so the security headers would be lost. Outside Development this middleware (inside UseHsts) turns
    /// such an exception into an empty 500 that keeps them. It logs the exception under Kestrel's category, event and
    /// message, as Kestrel did, and tags error.type for the request metric and trace. A started response or an aborted
    /// request is rethrown to Kestrel unchanged; client-disconnect cancellations are absorbed further in (499).
    /// </summary>
    private static void UseUnhandledExceptionAs500(this WebApplication app)
    {
        Microsoft.Extensions.Logging.ILogger logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Microsoft.AspNetCore.Server.Kestrel");
        app.Use(async (context, next) =>
        {
            try
            {
                await next(context);
            }
            catch (Exception exception) when (!context.Response.HasStarted && !context.RequestAborted.IsCancellationRequested)
            {
                logger.LogError(
                    new EventId(13, "ApplicationError"),
                    exception,
                    "Connection id \"{ConnectionId}\", Request id \"{TraceIdentifier}\": An unhandled exception was thrown by the application.",
                    context.Connection.Id,
                    context.TraceIdentifier);

                string errorType = exception.GetType().FullName ?? exception.GetType().Name;
                context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMetricsTagsFeature>()?.Tags.Add(new("error.type", errorType));
                System.Diagnostics.Activity.Current?.SetTag("error.type", errorType);

                HttpResponse response = context.Response;
                Microsoft.Extensions.Primitives.StringValues hsts = response.Headers.StrictTransportSecurity;
                response.Clear();
                if (!Microsoft.Extensions.Primitives.StringValues.IsNullOrEmpty(hsts))
                {
                    response.Headers.StrictTransportSecurity = hsts;
                }

                response.StatusCode = StatusCodes.Status500InternalServerError;
            }
        });
    }
}
