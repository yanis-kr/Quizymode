using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>#407 (AC 5.2.22): a JSON seed item's questionImage survives the case-insensitive file loaders into SeedItemRequest.</summary>
public sealed class SeedQuestionImageLoadTests : IDisposable
{
    private const string ItemsJson = """
        [
          {
            "itemId": "99999999-9999-9999-9999-999999999901",
            "category": "geography",
            "navigationKeyword1": "flags",
            "navigationKeyword2": "countries",
            "question": "Which country uses this flag?",
            "correctAnswer": "France",
            "incorrectAnswers": ["Italy"],
            "explanation": "Vertical bands",
            "questionImage": { "key": "curated:flags/fr", "altText": "Three vertical bands" },
            "explanationImage": { "key": "curated:diagrams/x", "altText": "A diagram" }
          },
          {
            "itemId": "99999999-9999-9999-9999-999999999902",
            "category": "geography",
            "navigationKeyword1": "flags",
            "navigationKeyword2": "countries",
            "question": "Capital of France?",
            "correctAnswer": "Paris",
            "incorrectAnswers": ["Lyon"]
          }
        ]
        """;

    private readonly string _root = Path.Combine(Path.GetTempPath(), "qi-seed-" + Guid.NewGuid());

    public SeedQuestionImageLoadTests()
    {
        string items = Path.Combine(_root, "data", "seed-source", "items", "geography");
        Directory.CreateDirectory(items);
        File.WriteAllText(Path.Combine(items, "geography.flags.countries.json"), ItemsJson);
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);

    [Fact]
    public async Task DatabaseSeeder_LoadSeedItemRequestsAsync_CarriesQuestionImage()
    {
        string path = Path.Combine(_root, "data", "seed-source", "items");

        List<SeedSyncAdmin.SeedItemRequest> requests = await DatabaseSeederHostedService.LoadSeedItemRequestsAsync(
            path, null, NullLogger.Instance, CancellationToken.None);

        requests.Should().HaveCount(2);
        requests[0].QuestionImage.Should().Be(new Quizymode.Api.Shared.Models.ItemImageReference("curated:flags/fr", "Three vertical bands"));
        requests[1].QuestionImage.Should().BeNull();
        requests[0].ExplanationImage.Should().Be(new Quizymode.Api.Shared.Models.ItemImageReference("curated:diagrams/x", "A diagram"));
        requests[1].ExplanationImage.Should().BeNull();
    }

    [Fact]
    public async Task LocalSeedLoader_LoadManifestAsync_CarriesQuestionImage()
    {
        Mock<IWebHostEnvironment> env = new();
        env.Setup(e => e.ContentRootPath).Returns(_root);
        LocalSeedLoader loader = new(env.Object, NullLogger<LocalSeedLoader>.Instance);

        Result<LoadedLocalSeedManifest> result = await loader.LoadManifestAsync(50, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Manifest.Items.Select(i => i.QuestionImage).Should().Equal(
            new Quizymode.Api.Shared.Models.ItemImageReference("curated:flags/fr", "Three vertical bands"),
            null);
        result.Value.Manifest.Items.Select(i => i.ExplanationImage).Should().Equal(
            new Quizymode.Api.Shared.Models.ItemImageReference("curated:diagrams/x", "A diagram"),
            null);
    }
}
