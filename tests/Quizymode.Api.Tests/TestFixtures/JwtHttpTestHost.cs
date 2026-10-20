using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.StartupExtensions;

namespace Quizymode.Api.Tests.TestFixtures;

/// <summary>
/// Hosts real endpoints on Kestrel behind the production JWT bearer configuration and "Admin" policy
/// (<see cref="StartupExtensions.AddAuthenticationServices"/>), so tests observe real 401/403/200
/// responses. Only signing-key discovery is replaced: tokens are signed with a per-host test key
/// instead of Cognito's JWKS, and issuer, audience, lifetime and signature are still validated.
/// </summary>
internal sealed class JwtHttpTestHost : IAsyncDisposable
{
    public const string Issuer = "https://cognito-idp.test.invalid/test-pool";
    public const string ClientId = "quizymode-test-client";

    private readonly WebApplication _app;
    private readonly SymmetricSecurityKey _signingKey;

    private JwtHttpTestHost(WebApplication app, SymmetricSecurityKey signingKey, HttpClient client)
    {
        _app = app;
        _signingKey = signingKey;
        Client = client;
    }

    public HttpClient Client { get; }

    public static async Task<JwtHttpTestHost> StartAsync(
        Func<ApplicationDbContext> createDbContext,
        Action<IServiceCollection> configureServices,
        Action<IEndpointRouteBuilder> mapEndpoints)
    {
        SymmetricSecurityKey signingKey = new(RandomNumberGenerator.GetBytes(32));

        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Authentication:Cognito:Authority"] = Issuer,
            ["Authentication:Cognito:ClientId"] = ClientId
        });

        builder.AddAuthenticationServices();
        builder.Services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
        {
            OpenIdConnectConfiguration configuration = new() { Issuer = Issuer };
            configuration.SigningKeys.Add(signingKey);
            options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(configuration);
        });

        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped(_ => createDbContext());
        builder.Services.AddScoped<IUserContext, UserContext>();
        builder.Services.AddScoped<IAuditService, AuditService>();
        configureServices(builder.Services);

        WebApplication app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.Use(UpsertUserAsync);
        mapEndpoints(app);
        await app.StartAsync();

        string address = app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!.Addresses.First();

        return new JwtHttpTestHost(app, signingKey, new HttpClient { BaseAddress = new Uri(address) });
    }

    /// <summary>Creates a bearer token shaped like a Cognito ID token for this host.</summary>
    public string CreateToken(
        string subject,
        string email,
        IReadOnlyCollection<string>? groups = null,
        string issuer = Issuer,
        DateTime? expiresUtc = null,
        object? emailVerified = null)
    {
        DateTime expires = expiresUtc ?? DateTime.UtcNow.AddMinutes(30);
        Dictionary<string, object> claims = new()
        {
            ["sub"] = subject,
            ["email"] = email,
            ["token_use"] = "id"
        };
        if (emailVerified is not null)
        {
            // Pass a bool for a JSON boolean claim or a string for a string claim; omit for an absent claim.
            claims["email_verified"] = emailVerified;
        }

        if (groups is { Count: > 0 })
        {
            claims["cognito:groups"] = groups.ToArray();
        }

        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = ClientId,
            Claims = claims,
            NotBefore = expires.AddHours(-2),
            IssuedAt = expires.AddHours(-2),
            Expires = expires,
            SigningCredentials = new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256)
        });
    }

    public static HttpRequestMessage Request(HttpMethod method, string path, string? token = null, HttpContent? content = null)
    {
        HttpRequestMessage request = new(method, path) { Content = content };
        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        return request;
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await _app.StopAsync();
        await _app.DisposeAsync();
    }

    // Stand-in for UserUpsertMiddleware, whose row lock uses PostgreSQL-only SQL (FOR UPDATE) that the
    // SQLite test database cannot run. Like the real middleware it maps the token subject to a Users
    // row and publishes the row id through HttpContext.Items["UserId"] for IUserContext.
    private static async Task UpsertUserAsync(HttpContext context, RequestDelegate next)
    {
        ClaimsPrincipal user = context.User;
        string? subject = user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier);
        if (user.Identity?.IsAuthenticated == true && subject is not null)
        {
            ApplicationDbContext db = context.RequestServices.GetRequiredService<ApplicationDbContext>();
            User? row = await db.Users.FirstOrDefaultAsync(candidate => candidate.Subject == subject, context.RequestAborted);
            if (row is null)
            {
                row = new User
                {
                    Id = Guid.NewGuid(),
                    Subject = subject,
                    Email = user.FindFirstValue("email") ?? user.FindFirstValue(ClaimTypes.Email),
                    Name = subject
                };
                db.Users.Add(row);
                await db.SaveChangesAsync(context.RequestAborted);
            }

            context.Items["UserId"] = row.Id.ToString();
        }

        await next(context);
    }
}
