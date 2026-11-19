using Microsoft.Extensions.Configuration;

namespace Quizymode.Api.Shared.Configuration;

internal sealed record ConfigKeySource(string Key, string Source);

/// <summary>Reports where each secret-looking configuration key comes from. Names only, never values.</summary>
internal static class ConfigSourceReport
{
    public static IReadOnlyList<ConfigKeySource> Build(IConfigurationRoot root)
    {
        Dictionary<string, string> sources = new(StringComparer.OrdinalIgnoreCase);
        foreach (IConfigurationProvider provider in root.Providers)
        {
            string source = provider switch
            {
                SsmConfigurationProvider => "ssm",
                _ when provider.GetType().Name.Contains("EnvironmentVariables", StringComparison.Ordinal) => "environment",
                _ => "appsettings",
            };

            HashSet<string> keys = new(StringComparer.OrdinalIgnoreCase);
            Collect(provider, null, keys);
            foreach (string key in keys)
            {
                if (SecretNames.IsSecretName(key) && provider.TryGet(key, out string? value) && !string.IsNullOrEmpty(value))
                {
                    sources[key] = source;
                }
            }
        }

        return sources.OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase).Select(pair => new ConfigKeySource(pair.Key, pair.Value)).ToList();
    }

    /// <summary>Names of the keys that SSM supplied, for the one startup log line.</summary>
    public static IReadOnlyList<string> SsmKeys(IConfigurationRoot root)
    {
        HashSet<string> keys = new(StringComparer.OrdinalIgnoreCase);
        foreach (IConfigurationProvider provider in root.Providers.OfType<SsmConfigurationProvider>())
        {
            Collect(provider, null, keys);
        }

        return keys.OrderBy(k => k, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static void Collect(IConfigurationProvider provider, string? parent, HashSet<string> keys)
    {
        foreach (string child in provider.GetChildKeys([], parent).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            string full = parent is null ? child : $"{parent}:{child}";
            if (provider.TryGet(full, out _))
            {
                keys.Add(full);
            }

            Collect(provider, full, keys);
        }
    }
}
