using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Admin;

internal interface IGitHubSeedSource
{
    Task<Result<LoadedGitHubSeedManifest>> LoadManifestAsync(
        SeedSyncAdmin.Request request,
        CancellationToken cancellationToken);
}

internal sealed record LoadedGitHubSeedManifest(
    SeedSyncAdmin.ManifestRequest Manifest,
    SeedSyncAdmin.SourceContext SourceContext);
