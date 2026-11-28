namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    internal const string CorsPolicyName = "WebOrigins";

    /// <summary>
    /// Configures Cross-Origin Resource Sharing (CORS) for the web app (#906).
    /// </summary>
    /// <remarks>Development allows any origin, so the Vite dev server and local tools keep working. Every other
    /// environment allows only the origins listed in <c>Cors:AllowedOrigins</c> (production lists
    /// <c>https://www.quizymode.com</c> and <c>https://quizymode.com</c> in appsettings.Production.json); with no
    /// list no cross-origin request is allowed. Any method and header is allowed for an allowed origin; credentials
    /// are not, as before (the web app sends a bearer token, not cookies).</remarks>
    /// <param name="builder">The <see cref="WebApplicationBuilder"/> to which the CORS services will be added.</param>
    /// <returns>The <see cref="WebApplicationBuilder"/> instance, enabling method chaining.</returns>
    public static WebApplicationBuilder AddCorsServices(this WebApplicationBuilder builder)
    {
        bool allowAnyOrigin = builder.Environment.IsDevelopment();
        string[] allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

        builder.Services.AddCors(options =>
        {
            options.AddPolicy(CorsPolicyName, policy =>
            {
                if (allowAnyOrigin)
                {
                    policy.AllowAnyOrigin();
                }
                else
                {
                    policy.WithOrigins(allowedOrigins);
                }

                policy.AllowAnyMethod()
                      .AllowAnyHeader();
            });
        });

        return builder;
    }
}
