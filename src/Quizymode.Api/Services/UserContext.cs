using System.Security.Claims;

namespace Quizymode.Api.Services;

public interface IUserContext
{
    bool IsAuthenticated { get; }

    string? UserId { get; }

    bool IsAdmin { get; }
}

internal sealed class UserContext(IHttpContextAccessor httpContextAccessor) : IUserContext
{
    private readonly IHttpContextAccessor _httpContextAccessor = httpContextAccessor;

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
            ClaimsPrincipal? user = _httpContextAccessor.HttpContext?.User;
            if (user is null)
            {
                return null;
            }

            // Preferred: Cognito subject (sub)
            string? sub = user.FindFirstValue("sub");
            if (!string.IsNullOrWhiteSpace(sub))
            {
                return sub;
            }

            // Fallback to NameIdentifier if present
            return user.FindFirstValue(ClaimTypes.NameIdentifier);
        }
    }

    public bool IsAdmin
    {
        get
        {
            ClaimsPrincipal? user = _httpContextAccessor.HttpContext?.User;
            if (user is null)
            {
                return false;
            }

            // Cognito can emit groups in "cognito:groups" claim
            IEnumerable<Claim> groupClaims = user.FindAll("cognito:groups");
            return groupClaims.Any(c => string.Equals(c.Value, "admins", StringComparison.OrdinalIgnoreCase));
        }
    }
}


