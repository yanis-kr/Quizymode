using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddAuthenticationServices(this WebApplicationBuilder builder)
    {
        IConfiguration configuration = builder.Configuration;

        // These should be configured in appsettings and can be overridden by environment variables.
        string authority = configuration["Authentication:Cognito:Authority"]
            ?? "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212";

        string audience = configuration["Authentication:Cognito:Audience"]
            ?? configuration["Authentication:Cognito:ClientId"]
            ?? string.Empty;

        builder.Services
            .AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.Authority = authority;
                if (!string.IsNullOrWhiteSpace(audience))
                {
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateAudience = true,
                        ValidAudience = audience
                    };
                }
                else
                {
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateAudience = false
                    };
                }

                options.TokenValidationParameters.ValidateIssuer = true;
                options.TokenValidationParameters.ValidIssuer = authority;
                options.TokenValidationParameters.ValidateLifetime = true;
                options.TokenValidationParameters.ValidateIssuerSigningKey = true;
            });

        builder.Services.AddAuthorization(options =>
        {
            // Simple admin policy based on Cognito group claim
            options.AddPolicy("Admin", policy =>
            {
                policy.RequireAuthenticatedUser();
                policy.RequireClaim("cognito:groups", "admins");
            });
        });

        return builder;
    }
}


