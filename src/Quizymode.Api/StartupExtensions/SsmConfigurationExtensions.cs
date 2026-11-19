using Quizymode.Api.Shared.Configuration;
using Serilog;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    /// <summary>
    /// Adds the SSM Parameter Store source after the APP_ environment source so SSM wins for the same key. Does nothing
    /// unless Config:Ssm:Enabled is true. Logs the names of the keys SSM supplied, never values.
    /// </summary>
    internal static WebApplicationBuilder AddSsmConfiguration(this WebApplicationBuilder builder)
    {
        SsmSettings? settings = SsmSettings.From(builder.Configuration);
        if (settings is null)
        {
            return builder;
        }

        ((IConfigurationBuilder)builder.Configuration).Add(new SsmConfigurationSource(settings));
        IReadOnlyList<string> keys = ConfigSourceReport.SsmKeys(builder.Configuration);
        Log.Information("Configuration loaded from SSM under {Prefix}: {KeyCount} keys: {Keys}", settings.Prefix, keys.Count, string.Join(", ", keys));
        return builder;
    }
}
