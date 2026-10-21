using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Kernel;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class LocalSeedLoaderTests
{
    [Fact]
    public async Task LoadManifestAsync_NullEntryInSeedFile_DoesNotThrowAndLetsValidationReject()
    {
        string root = Path.Combine(Path.GetTempPath(), $"seed-loader-{Guid.NewGuid():N}");
        string itemsDir = Path.Combine(root, "data", "seed-source", "items");
        Directory.CreateDirectory(itemsDir);
        try
        {
            await File.WriteAllTextAsync(Path.Combine(itemsDir, "x.json"), "[null]");
            Mock<IWebHostEnvironment> env = new();
            env.Setup(e => e.ContentRootPath).Returns(root);
            LocalSeedLoader loader = new(env.Object, NullLogger<LocalSeedLoader>.Instance);

            Result<LoadedLocalSeedManifest> result = await loader.LoadManifestAsync(50, CancellationToken.None);

            result.IsSuccess.Should().BeTrue();
            result.Value!.Manifest.Items.Should().ContainSingle().Which.Should().BeNull();
            SeedSyncAdmin.ValidateManifest(result.Value.Manifest).Errors
                .Select(e => e.ErrorMessage)
                .Should().Contain("Items must not contain null entries.");
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
