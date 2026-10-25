namespace Quizymode.Api.Shared.Options;

/// <summary>
/// Npgsql pool defaults (#339). Applied only when the connection string does not set the same key.
/// Supabase Supavisor session mode allows 15 client slots in total, so the default cap is small.
/// </summary>
internal sealed record class DatabaseOptions
{
    public const string SectionName = "Database";

    public int MaxPoolSize { get; init; } = 5;

    public int ConnectionIdleLifetimeSeconds { get; init; } = 60;
}
