namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddCorsServices(this WebApplicationBuilder builder)
    {
        builder.Services.AddCors(options =>
        {
            options.AddPolicy("AllowAll", policy =>
            {
                policy.AllowAnyOrigin()
                      .AllowAnyMethod()
                      .AllowAnyHeader();
            });
        });

        return builder;
    }
}
