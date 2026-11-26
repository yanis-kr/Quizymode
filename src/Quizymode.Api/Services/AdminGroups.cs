using System.Security.Claims;

namespace Quizymode.Api.Services;

/// <summary>
/// Single source of truth for which Cognito groups grant admin access (AC 4.1.4, #809). Used by the "Admin"
/// authorization policy and by <see cref="IUserContext.IsAdmin"/>. A user is admin only when a
/// <c>cognito:groups</c> value is exactly equal (case-sensitive, as Cognito group names are) to an allowlisted name.
/// </summary>
internal static class AdminGroups
{
    internal const string ConfigKey = "Authentication:AdminGroups";
    internal const string GroupsClaimType = "cognito:groups";
    internal const string DefaultGroup = "Admins";

    /// <summary>
    /// Resolves the allowlist. Unset configuration yields <c>["Admins"]</c>. When the key is present it wins: either a
    /// list (<c>Authentication:AdminGroups:0</c>, ...) or one comma-separated string. A present-but-empty value yields an
    /// empty allowlist, which fails closed (nobody is admin).
    /// </summary>
    internal static IReadOnlyList<string> Resolve(IConfiguration configuration)
    {
        IConfigurationSection section = configuration.GetSection(ConfigKey);
        List<string> configured = [];

        foreach (IConfigurationSection child in section.GetChildren())
        {
            AddIfNotBlank(configured, child.Value);
        }

        if (section.Value is not null)
        {
            foreach (string part in section.Value.Split(','))
            {
                AddIfNotBlank(configured, part);
            }

            return configured;
        }

        return configured.Count > 0 ? configured : [DefaultGroup];
    }

    internal static bool IsAdmin(ClaimsPrincipal? user, IReadOnlyCollection<string> allowedGroups)
    {
        if (user is null || allowedGroups.Count == 0)
        {
            return false;
        }

        return user.FindAll(GroupsClaimType).Any(claim => allowedGroups.Contains(claim.Value, StringComparer.Ordinal));
    }

    private static void AddIfNotBlank(List<string> target, string? value)
    {
        string? trimmed = value?.Trim();
        if (!string.IsNullOrEmpty(trimmed))
        {
            target.Add(trimmed);
        }
    }
}
