namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder ConfigureServices(this WebApplicationBuilder builder)
    {
        builder.Configuration.AddEnvironmentVariables(prefix: "APP_");

        builder.AddServiceDefaults();
        builder.AddLoggingServices();
        builder.AddSwaggerServices();
        builder.AddHealthCheckServices();
        builder.AddCorsServices();
        builder.AddPostgreSqlServices();

        // Configure forwarded headers for proxy scenarios (Cloudflare in production, Aspire in development)
        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor 
                | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto 
                | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedHost;
            
            if (builder.Environment.IsDevelopment())
            {
                // In development, trust localhost and loopback addresses for Aspire proxy
                options.KnownNetworks.Clear();
                options.KnownProxies.Clear();
                options.KnownProxies.Add(System.Net.IPAddress.Loopback);
                options.KnownProxies.Add(System.Net.IPAddress.IPv6Loopback);
            }
            else
            {
                // In production, only trust Cloudflare's IP ranges
                // Cloudflare IPs should be configured via KnownNetworks
            }
        });

        // Add authentication before custom services so middleware and IUserContext work
        builder.AddAuthenticationServices();

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

        if (app.Environment.IsDevelopment())
        {
            app.UseDeveloperExceptionPage();
            app.UseSwaggerUI(c =>
            {
                c.SwaggerEndpoint("/openapi/v1.json", "QuizyMode API v1");
                //c.RoutePrefix = "swagger";
            });
        }

        app.UseHttpsRedirection();
        app.UseCors("AllowAll");

        // Authentication & Authorization
        app.UseAuthentication();
        app.UseAuthorization();

        // Upsert user record on authenticated requests
        app.UseMiddleware<Services.UserUpsertMiddleware>();

        // Map OpenAPI endpoint before other endpoints
        app.MapOpenApi();

        app.MapDefaultEndpoints();
        //app.MapHealthChecks("/health");
        
        // Auto-discover and map all feature endpoints
        app.MapFeatureEndpoints();

        return app;
    }
}
