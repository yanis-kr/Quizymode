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
        if (options.MaxPoolSize < 1)
        {
            throw new InvalidOperationException(
                $"{DatabaseOptions.SectionName}:{nameof(DatabaseOptions.MaxPoolSize)} must be at least 1 (was {options.MaxPoolSize}).");
        }

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

        // Npgsql checks these only when it builds a pooled data source, i.e. on first use inside the startup migration (#350).
        // Fail here instead, naming the key; never echo the connection string.
        if (builder.Pooling)
        {
            int pruning = builder.ConnectionPruningInterval;
            if (pruning < 1)
            {
                throw new InvalidOperationException(
                    $"{PruningIntervalKey} in the PostgreSQL connection string must be at least 1 s (was {pruning}).");
            }

            if (builder.ConnectionIdleLifetime < pruning)
            {
                string source = hasIdleLifetime
                    ? $"{IdleLifetimeKey} in the PostgreSQL connection string"
                    : $"{DatabaseOptions.SectionName}:{nameof(DatabaseOptions.ConnectionIdleLifetimeSeconds)}";
                throw new InvalidOperationException(
                    $"{source} must be at least the {PruningIntervalKey} of {pruning} s (was {builder.ConnectionIdleLifetime}).");
            }
        }

        return builder.ConnectionString;
    }
}
