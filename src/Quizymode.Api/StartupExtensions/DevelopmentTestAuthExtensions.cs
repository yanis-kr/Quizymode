using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace Quizymode.Api.StartupExtensions;

/// <summary>
/// Development-only test authentication (AC 7.8). Lets local runs and ephemeral E2E environments call
/// signed-in endpoints without a Cognito login. The scheme is registered only when the host environment is
/// Development AND configuration <c>Authentication:DevTest:Enabled</c> is true (env var
/// <c>Authentication__DevTest__Enabled=true</c>, #808). Otherwise it does not exist, so a token of this form is just
/// an invalid JWT. Non-Development environments never register it, even with the flag set.
/// Header form: <c>Authorization: DevTest &lt;userId&gt;</c>, or <c>Authorization: DevTest &lt;userId&gt; admin</c>
/// to also carry the admin group claim.
/// </summary>
internal static class DevelopmentTestAuthExtensions
{
    internal const string SchemeName = "DevTest";
    internal const string EnabledConfigKey = "Authentication:DevTest:Enabled";

    private const string HeaderPrefix = SchemeName + " ";
    private const string AdminGroup = "admin";
    private const int MaxUserIdLength = 64;

    public static WebApplicationBuilder AddDevelopmentTestAuthentication(this WebApplicationBuilder builder)
    {
        // #808: Development alone is not enough; the flag must be an explicit "true". Unset, empty or any other
        // value leaves the scheme unregistered.
        bool optedIn = bool.TryParse(builder.Configuration[EnabledConfigKey], out bool enabled) && enabled;
        if (!builder.Environment.IsDevelopment() || !optedIn)
        {
            return builder;
        }

        builder.Services
            .AddAuthentication()
            .AddScheme<AuthenticationSchemeOptions, DevTestAuthHandler>(SchemeName, _ => { });

        // The default (JWT) scheme forwards requests that carry a DevTest header to the test scheme.
        // Every other request keeps the Cognito path unchanged.
        builder.Services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
        {
            options.ForwardDefaultSelector = context => HasDevTestHeader(context) ? SchemeName : null;
        });

        return builder;
    }

    internal static bool HasDevTestHeader(HttpContext context) =>
        context.Request.Headers.Authorization.ToString().StartsWith(HeaderPrefix, StringComparison.Ordinal);

    internal static bool TryParseHeader(string? header, out string userId, out bool isAdmin)
    {
        userId = string.Empty;
        isAdmin = false;

        if (string.IsNullOrEmpty(header) || !header.StartsWith(HeaderPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        string[] parts = header[HeaderPrefix.Length..].Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length is 0 or > 2)
        {
            return false;
        }

        string candidate = parts[0];
        if (candidate.Length > MaxUserIdLength || !candidate.All(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_'))
        {
            return false;
        }

        if (parts.Length == 2)
        {
            if (!string.Equals(parts[1], AdminGroup, StringComparison.Ordinal))
            {
                return false;
            }

            isAdmin = true;
        }

        userId = candidate;
        return true;
    }

    internal sealed class DevTestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory loggerFactory,
        UrlEncoder encoder,
        IWebHostEnvironment environment)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, loggerFactory, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            // Defence in depth: the scheme is only registered in Development, but never authenticate elsewhere.
            if (!environment.IsDevelopment())
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            if (!TryParseHeader(Request.Headers.Authorization.ToString(), out string userId, out bool isAdmin))
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            List<Claim> claims =
            [
                new Claim(ClaimTypes.NameIdentifier, userId),
                new Claim("sub", userId),
                new Claim(ClaimTypes.Name, userId),
            ];
            if (isAdmin)
            {
                claims.Add(new Claim("cognito:groups", AdminGroup));
            }

            var identity = new ClaimsIdentity(claims, SchemeName);
            var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName);
            return Task.FromResult(AuthenticateResult.Success(ticket));
        }
    }
}
