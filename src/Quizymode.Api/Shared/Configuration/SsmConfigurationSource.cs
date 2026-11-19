using Amazon;
using Amazon.Runtime;
using Amazon.SimpleSystemsManagement;
using Amazon.SimpleSystemsManagement.Model;
using Microsoft.Extensions.Configuration;

namespace Quizymode.Api.Shared.Configuration;

/// <summary>
/// Loads every SSM parameter under a prefix as configuration (/quizymode/prod/Media/S3/AccessKeyId becomes
/// Media:S3:AccessKeyId). Off unless Config:Ssm:Enabled is true. Credentials come only from Config:Ssm:*, never from
/// the AWS_* environment, so other AWS clients keep their own identity. Fails fast on any error or an empty result;
/// messages name the error type and prefix, never a value.
/// </summary>
internal sealed class SsmConfigurationSource(SsmSettings settings, Func<IAmazonSimpleSystemsManagement>? clientFactory = null) : IConfigurationSource
{
    public IConfigurationProvider Build(IConfigurationBuilder builder) => new SsmConfigurationProvider(settings, clientFactory);
}

internal sealed record SsmSettings(string Prefix, string Region, string AccessKeyId, string SecretAccessKey)
{
    public const string DefaultPrefix = "/quizymode/prod/";

    public static SsmSettings? From(IConfiguration configuration)
    {
        IConfigurationSection section = configuration.GetSection("Config:Ssm");
        if (!bool.TryParse(section["Enabled"], out bool enabled) || !enabled)
        {
            return null;
        }

        string prefix = section["Prefix"] is { Length: > 0 } configured ? configured : DefaultPrefix;
        if (!prefix.EndsWith('/'))
        {
            prefix += "/";
        }

        return new SsmSettings(prefix, section["Region"] ?? string.Empty, section["AccessKeyId"] ?? string.Empty, section["SecretAccessKey"] ?? string.Empty);
    }
}

internal sealed class SsmConfigurationProvider(SsmSettings settings, Func<IAmazonSimpleSystemsManagement>? clientFactory) : ConfigurationProvider
{
    public override void Load()
    {
        try
        {
            Data = LoadAsync().GetAwaiter().GetResult();
        }
        catch (InvalidOperationException)
        {
            throw;
        }
        catch (Exception ex)
        {
            // Only the type and prefix: the exception text could echo request details.
            throw new InvalidOperationException($"SSM configuration failed to load under {settings.Prefix}: {ex.GetType().Name}.");
        }
    }

    private async Task<Dictionary<string, string?>> LoadAsync()
    {
        if (clientFactory is null && (settings.Region.Length == 0 || settings.AccessKeyId.Length == 0 || settings.SecretAccessKey.Length == 0))
        {
            throw new InvalidOperationException($"SSM configuration is enabled for {settings.Prefix} but Config:Ssm Region, AccessKeyId or SecretAccessKey is missing.");
        }

        using IAmazonSimpleSystemsManagement client = clientFactory?.Invoke()
            ?? new AmazonSimpleSystemsManagementClient(new BasicAWSCredentials(settings.AccessKeyId, settings.SecretAccessKey), RegionEndpoint.GetBySystemName(settings.Region));

        Dictionary<string, string?> data = new(StringComparer.OrdinalIgnoreCase);
        string? next = null;
        do
        {
            GetParametersByPathResponse page = await client.GetParametersByPathAsync(new GetParametersByPathRequest
            {
                Path = settings.Prefix,
                Recursive = true,
                WithDecryption = true,
                NextToken = next,
            });

            foreach (Parameter parameter in page.Parameters)
            {
                string key = parameter.Name[settings.Prefix.Length..].Trim('/').Replace('/', ':');
                if (key.Length > 0)
                {
                    data[key] = parameter.Value;
                }
            }

            next = page.NextToken;
        }
        while (!string.IsNullOrEmpty(next));

        if (data.Count == 0)
        {
            throw new InvalidOperationException($"SSM configuration is enabled but no parameters were found under {settings.Prefix}.");
        }

        return data;
    }
}
