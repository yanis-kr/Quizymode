using Quizymode.Api.StartupExtensions;

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

        app.UseHttpsRedirection();
        app.UseCors("AllowAll");
        app.MapDefaultEndpoints();
        app.MapHealthChecks("/health");
        
        // Auto-discover and map all feature endpoints
        app.MapFeatureEndpoints();

        return app;
    }
}
