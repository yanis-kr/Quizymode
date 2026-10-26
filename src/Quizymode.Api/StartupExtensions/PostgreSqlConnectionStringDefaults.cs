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
    private const string PruningIntervalKey = "Connection Pruning Interval";

    public static string Apply(string connectionString, DatabaseOptions options)
    {
        NpgsqlConnectionStringBuilder builder = new(connectionString);
        Validate(options, builder.ConnectionPruningInterval);

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
        else if (builder.ConnectionIdleLifetime < builder.ConnectionPruningInterval)
        {
            // Npgsql would only throw on first use, inside the startup migration (#350). Never echo the connection string.
            throw new InvalidOperationException(
                $"{IdleLifetimeKey} in the PostgreSQL connection string must be at least its {PruningIntervalKey} of {builder.ConnectionPruningInterval} s (was {builder.ConnectionIdleLifetime}).");
        }

        return builder.ConnectionString;
    }

    /// <param name="pruningIntervalSeconds">The connection string's pruning interval (explicit or the Npgsql default, 10 s).</param>
    private static void Validate(DatabaseOptions options, int pruningIntervalSeconds)
    {
        if (options.MaxPoolSize < 1)
        {
            throw new InvalidOperationException(
                $"{DatabaseOptions.SectionName}:{nameof(DatabaseOptions.MaxPoolSize)} must be at least 1 (was {options.MaxPoolSize}).");
        }

        // Npgsql refuses an idle lifetime shorter than the pruning interval.
        if (options.ConnectionIdleLifetimeSeconds < pruningIntervalSeconds)
        {
            throw new InvalidOperationException(
                $"{DatabaseOptions.SectionName}:{nameof(DatabaseOptions.ConnectionIdleLifetimeSeconds)} must be at least the {PruningIntervalKey} of {pruningIntervalSeconds} s (was {options.ConnectionIdleLifetimeSeconds}).");
        }
    }
}
