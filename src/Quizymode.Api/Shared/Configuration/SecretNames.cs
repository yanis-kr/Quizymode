using System.Text.RegularExpressions;

namespace Quizymode.Api.Shared.Configuration;

/// <summary>Recognises configuration keys and log property names that hold secrets.</summary>
internal static partial class SecretNames
{
    [GeneratedRegex("key|secret|password|token|connectionstring|credential", RegexOptions.IgnoreCase)]
    private static partial Regex Pattern();

    public static bool IsSecretName(string name) => Pattern().IsMatch(name);
}
