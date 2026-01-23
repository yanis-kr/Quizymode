using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddAuthenticationServices(this WebApplicationBuilder builder)
    {
        IConfiguration configuration = builder.Configuration;

        // These must be configured via appsettings, environment variables, or Aspire AppHost.
        // Environment variables use APP_ prefix and double underscores for nested keys:
        // APP_Authentication__Cognito__Authority
        // APP_Authentication__Cognito__ClientId
        string authority = configuration["Authentication:Cognito:Authority"]
            ?? throw new InvalidOperationException(
                "Authentication:Cognito:Authority must be configured. " +
                "Set it in appsettings.json, environment variables (APP_Authentication__Cognito__Authority), " +
                "or via Aspire AppHost configuration.");

        string clientId = configuration["Authentication:Cognito:ClientId"]
            ?? throw new InvalidOperationException(
                "Authentication:Cognito:ClientId must be configured. " +
                "Set it in appsettings.json, environment variables (APP_Authentication__Cognito__ClientId), " +
                "or via Aspire AppHost configuration.");

        // For Cognito, the audience should be the client ID
        // Check for null or empty string (empty strings in appsettings.json won't trigger ??)
        string? configuredAudience = configuration["Authentication:Cognito:Audience"];
        string audience = string.IsNullOrWhiteSpace(configuredAudience) ? clientId : configuredAudience;

        // Issuer can be configured separately, but defaults to authority
        // For AWS Cognito, the issuer in tokens is typically the user pool issuer URL
        // which may differ from the authority (domain) URL
        string? configuredIssuer = configuration["Authentication:Cognito:Issuer"];
        string issuer = string.IsNullOrWhiteSpace(configuredIssuer) ? authority : configuredIssuer;

        // Log configuration values (using Serilog directly since logging is already configured)
        Serilog.Log.Logger.Information("Authentication configuration - Authority: {Authority}, Issuer: {Issuer}, ClientId: {ClientId}, Audience: {Audience}", 
            authority, issuer, clientId, audience);

        builder.Services
            .AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.Authority = authority;
                
                // Configure token validation parameters
                // The middleware will automatically discover the metadata endpoint
                // from the authority URL (/.well-known/openid-configuration)
                // However, we explicitly set ValidIssuer to ensure it works in all environments
                // For AWS Cognito, the issuer in tokens may differ from the authority URL
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateAudience = true,
                    ValidAudience = audience,
                    ValidateIssuer = true,
                    ValidIssuer = issuer, // Explicitly set issuer (defaults to authority if not configured)
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    // Cognito uses RS256 for token signing
                    ClockSkew = TimeSpan.FromMinutes(5)
                };

                // DEBUG: Add event handlers to see what's happening during token validation
                options.Events = new JwtBearerEvents
                {
                    OnAuthenticationFailed = context =>
                    {
                        System.Diagnostics.Debug.WriteLine($"[JWT AUTH FAILED] Error: {context.Exception.Message}");
                        System.Diagnostics.Debug.WriteLine($"[JWT AUTH FAILED] Exception Type: {context.Exception.GetType().Name}");
                        return Task.CompletedTask;
                    },
                    OnTokenValidated = context =>
                    {
                        System.Diagnostics.Debug.WriteLine($"[JWT TOKEN VALIDATED] User: {context.Principal?.Identity?.Name}");
                        System.Diagnostics.Debug.WriteLine($"[JWT TOKEN VALIDATED] Claims Count: {context.Principal?.Claims.Count() ?? 0}");
                        return Task.CompletedTask;
                    },
                    OnChallenge = context =>
                    {
                        System.Diagnostics.Debug.WriteLine($"[JWT CHALLENGE] Error: {context.Error}");
                        System.Diagnostics.Debug.WriteLine($"[JWT CHALLENGE] Error Description: {context.ErrorDescription}");
                        return Task.CompletedTask;
                    }
                };
            });

        builder.Services.AddAuthorization(options =>
        {
            // Admin policy based on Cognito group claim
            // Checks for any group starting with "admin" (case-insensitive)
            options.AddPolicy("Admin", policy =>
            {
                policy.RequireAuthenticatedUser();
                policy.RequireAssertion(context =>
                {
                    if (!context.User.Identity?.IsAuthenticated ?? true)
                    {
                        return false;
                    }

                    IEnumerable<Claim> groupClaims = context.User.FindAll("cognito:groups");
                    return groupClaims.Any(c => 
                        c.Value.StartsWith("admin", StringComparison.OrdinalIgnoreCase));
                });
            });
        });

        return builder;
    }
}


