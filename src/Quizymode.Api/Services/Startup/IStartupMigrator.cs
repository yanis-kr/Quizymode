namespace Quizymode.Api.Services.Startup;

/// <summary>Applies pending EF migrations. A seam so tests can count calls: it must run exactly once per boot (#732).</summary>
internal interface IStartupMigrator
{
    Task MigrateAsync(CancellationToken cancellationToken);
}
