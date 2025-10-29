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
        builder.AddMongoDbServices();
        builder.AddCustomServices();
        builder.AddCollectionsFeature();
        builder.AddItemsFeature();
        builder.AddImportFeature();

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
        app.MapCollectionsEndpoints();
        app.MapItemsEndpoints();
        app.MapImportEndpoints();

        return app;
    }
}
