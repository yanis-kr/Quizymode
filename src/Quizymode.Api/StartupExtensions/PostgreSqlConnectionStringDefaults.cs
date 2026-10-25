using Npgsql;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.StartupExtensions;

/// <summary>
/// Adds the pool defaults from <see cref="DatabaseOptions"/> to a connection string without overriding keys the
/// operator set explicitly (#339). The result contains the password: never log it.
/// </summary>
internal static class PostgreSqlConnectionStringDefaults
{
    private const string MaxPoolSizeKey = "Maximum Pool Size";
    private const string IdleLifetimeKey = "Connection Idle Lifetime";

    public static string Apply(string connectionString, DatabaseOptions options)
    {
        Validate(options);

        NpgsqlConnectionStringBuilder builder = new(connectionString);
        bool hasMaxPoolSize = builder.Keys.Contains(MaxPoolSizeKey, StringComparer.OrdinalIgnoreCase);
        bool hasIdleLifetime = builder.Keys.Contains(IdleLifetimeKey, StringComparer.OrdinalIgnoreCase);

        if (!hasMaxPoolSize)
        {
            // Npgsql rejects Minimum Pool Size > Maximum Pool Size.
            builder.MaxPoolSize = Math.Max(options.MaxPoolSize, builder.MinPoolSize);
        }

        if (!hasIdleLifetime)
        {
            builder.ConnectionIdleLifetime = options.ConnectionIdleLifetimeSeconds;
        }

        return builder.ConnectionString;
    }

    public static void Validate(DatabaseOptions options)
    {
        if (options.MaxPoolSize < 1)
        {
            throw new InvalidOperationException(
                $"{DatabaseOptions.SectionName}:{nameof(DatabaseOptions.MaxPoolSize)} must be at least 1 (was {options.MaxPoolSize}).");
        }

        // Npgsql refuses an idle lifetime shorter than the pruning interval (10 s by default).
        int minIdle = new NpgsqlConnectionStringBuilder().ConnectionPruningInterval;
        if (options.ConnectionIdleLifetimeSeconds < minIdle)
        {
            throw new InvalidOperationException(
                $"{DatabaseOptions.SectionName}:{nameof(DatabaseOptions.ConnectionIdleLifetimeSeconds)} must be at least {minIdle} (was {options.ConnectionIdleLifetimeSeconds}).");
        }
    }
}
