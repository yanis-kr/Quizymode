using System.Security.Claims;

namespace Quizymode.Api.Services;

public interface IUserContext
{
    bool IsAuthenticated { get; }

    string? UserId { get; }

    bool IsAdmin { get; }
}

internal sealed class UserContext(
    IHttpContextAccessor httpContextAccessor,
    ILogger<UserContext> logger,
    IConfiguration configuration) : IUserContext
{
    private readonly IHttpContextAccessor _httpContextAccessor = httpContextAccessor;
    private readonly ILogger<UserContext> _logger = logger;
    private readonly IReadOnlyList<string> _adminGroups = AdminGroups.Resolve(configuration);

    public bool IsAuthenticated
    {
        get
        {
            ClaimsPrincipal? user = _httpContextAccessor.HttpContext?.User;
            return user?.Identity?.IsAuthenticated ?? false;
        }
    }

    public string? UserId
    {
        get
        {
            HttpContext? httpContext = _httpContextAccessor.HttpContext;
            if (httpContext is null)
            {
                _logger.LogDebug("UserContext.UserId: HttpContext is null");
                return null;
            }

            // UserUpsertMiddleware stores UserId (GUID) in HttpContext.Items
            if (httpContext.Items.TryGetValue("UserId", out object? userIdObj) && userIdObj is string userId)
            {
                _logger.LogDebug("UserContext.UserId: Found UserId from HttpContext.Items: {UserId}", userId);
                return userId;
            }

            // Fallback: if UserUpsertMiddleware hasn't run yet, log a warning
            ClaimsPrincipal? user = httpContext.User;
            if (user?.Identity?.IsAuthenticated ?? false)
            {
                _logger.LogWarning("UserContext.UserId: User is authenticated but UserId not found in HttpContext.Items. UserUpsertMiddleware may not have run yet.");
            }
            else
            {
                _logger.LogDebug("UserContext.UserId: User is not authenticated");
            }

            return null;
        }
    }

    // AC 4.1.4: admin = a "cognito:groups" value exactly equal to an allowlisted name (default "Admins").
    public bool IsAdmin => AdminGroups.IsAdmin(_httpContextAccessor.HttpContext?.User, _adminGroups);
}


