namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    /// <summary>
    /// Configures Cross-Origin Resource Sharing (CORS) services with a policy that allows any origin, method, and
    /// header.
    /// </summary>
    /// <remarks>This method adds a CORS policy named "AllowAll" to the application's service collection.  The
    /// policy permits requests from any origin, using any HTTP method, and with any headers.</remarks>
    /// <param name="builder">The <see cref="WebApplicationBuilder"/> to which the CORS services will be added.</param>
    /// <returns>The <see cref="WebApplicationBuilder"/> instance, enabling method chaining.</returns>
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
