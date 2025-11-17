using Microsoft.AspNetCore.HttpOverrides;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder ConfigureServices(this WebApplicationBuilder builder)
    {
        builder.Configuration.AddEnvironmentVariables(prefix: "APP_");

        builder.AddServiceDefaults();
        builder.AddLoggingServices();
        builder.AddSwaggerServices();
        builder.AddAuthenticationServices();
        builder.AddHealthCheckServices();
        builder.AddCorsServices();
        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.KnownNetworks.Clear();
            options.KnownProxies.Clear();
        });
        builder.AddPostgreSqlServices();
        builder.AddCustomServices();
        
        // Auto-discover and register all features
        builder.AddFeatureRegistrations();

        return builder;
    }

    public static WebApplication ConfigurePipeline(this WebApplication app)
    {
        if (app.Environment.IsDevelopment())
        {
            app.UseDeveloperExceptionPage();
            //app.UseSwagger();
            app.UseSwaggerUI(c =>
            {
                app.MapOpenApi();
                c.SwaggerEndpoint("/openapi/v1.json", "QuizyMode API v1");
                //c.RoutePrefix = "swagger";
            });
        }

        // NOTE: UseHttpsRedirection is intentionally disabled when running behind Cloudflare.
        // 
        // Cloudflare terminates HTTPS at the edge and forwards traffic to the Lightsail
        // container over HTTP. If the application forces HTTPS redirection here, it will
        // redirect every HTTP request back to the HTTPS Cloudflare URL, which Cloudflare
        // again forwards as HTTP � creating an infinite redirect loop (ERR_TOO_MANY_REDIRECTS).
        //
        // In this deployment model, Cloudflare manages TLS, and the app should accept
        // HTTP from the reverse proxy without local HTTPS enforcement. If HTTPS is needed
        // locally (development), conditionally enable UseHttpsRedirection only when the
        // app is NOT running behind a proxy.

        //app.UseHttpsRedirection();

        app.UseForwardedHeaders();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseCors("AllowAll");
        app.MapDefaultEndpoints();
        
        // Auto-discover and map all feature endpoints
        app.MapFeatureEndpoints();

        return app;
    }
}
