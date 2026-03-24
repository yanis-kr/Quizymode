using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class SeedSyncAdminTests : ItemTestFixture
{
    private readonly SeedSyncAdminService _service;

    public SeedSyncAdminTests()
    {
        _service = new SeedSyncAdminService(DbContext, TaxonomyRegistry);
    }

    [Fact]
    public async Task PreviewAsync_InitialSeed_SuppressesDetailedPreview()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");

        SeedSyncAdmin.Request request = BuildRequest(
            "core-geography",
            [
                BuildItem(
                    Guid.Parse("11111111-1111-1111-1111-111111111111"),
                    "What is the capital of France?",
                    "Paris",
                    ["Lyon", "Marseille", "Nice"],
                    explanation: "Paris is the capital city of France.",
                    keywords: ["european-union"]),
                BuildItem(
                    Guid.Parse("22222222-2222-2222-2222-222222222222"),
                    "What is the capital of Germany?",
                    "Berlin",
                    ["Munich", "Hamburg", "Frankfurt"],
                    explanation: "Berlin is the capital city of Germany.")
            ]);

        var result = await _service.PreviewAsync(request, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value!.IsInitialSeed.Should().BeTrue();
        result.Value.PreviewSuppressed.Should().BeTrue();
        result.Value.CreatedCount.Should().Be(2);
        result.Value.UpdatedCount.Should().Be(0);
        result.Value.UnchangedCount.Should().Be(0);
        result.Value.Changes.Should().BeEmpty();
    }

    [Fact]
    public async Task ApplyAsync_InsertsSeedManagedItems_AndCreatesPublicKeywords()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");

        Guid seedId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        SeedSyncAdmin.Request request = BuildRequest(
            "core-geography",
            [
                BuildItem(
                    seedId,
                    "What is the capital of Italy?",
                    "Rome",
                    ["Milan", "Naples", "Turin"],
                    explanation: "Rome is the capital city of Italy.",
                    keywords: ["eurozone", "mediterranean"])
            ]);

        var result = await _service.ApplyAsync(request, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.CreatedCount.Should().Be(1);

        Item item = await DbContext.Items
            .Include(i => i.ItemKeywords)
                .ThenInclude(ik => ik.Keyword)
            .SingleAsync();

        item.SeedId.Should().Be(seedId);
        item.IsSeedManaged.Should().BeTrue();
        item.SeedSet.Should().Be("core-geography");
        item.SeedHash.Should().NotBeNullOrWhiteSpace();
        item.SeedLastSyncedAt.Should().NotBeNull();
        item.IsPrivate.Should().BeFalse();
        item.CreatedBy.Should().Be("seeder");

        List<string> attachedKeywords = item.ItemKeywords
            .Select(ik => ik.Keyword.Name)
            .OrderBy(x => x)
            .ToList();

        attachedKeywords.Should().Contain("capitals");
        attachedKeywords.Should().Contain("europe");
        attachedKeywords.Should().Contain("eurozone");
        attachedKeywords.Should().Contain("mediterranean");

        DbContext.Keywords.Should().Contain(k => k.Name == "eurozone" && !k.IsPrivate);
        DbContext.Keywords.Should().Contain(k => k.Name == "mediterranean" && !k.IsPrivate);
    }

    [Fact]
    public async Task PreviewAsync_AfterInitialSeed_ReturnsOnlyDelta()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");

        Guid franceSeedId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        Guid germanySeedId = Guid.Parse("55555555-5555-5555-5555-555555555555");
        Guid spainSeedId = Guid.Parse("66666666-6666-6666-6666-666666666666");

        SeedSyncAdmin.Request initialRequest = BuildRequest(
            "core-geography",
            [
                BuildItem(franceSeedId, "What is the capital of France?", "Paris", ["Lyon", "Marseille", "Nice"], explanation: "Initial explanation."),
                BuildItem(germanySeedId, "What is the capital of Germany?", "Berlin", ["Munich", "Hamburg", "Frankfurt"])
            ]);

        var initialApply = await _service.ApplyAsync(initialRequest, CancellationToken.None);
        initialApply.IsSuccess.Should().BeTrue();

        SeedSyncAdmin.Request updatedRequest = BuildRequest(
            "core-geography",
            [
                BuildItem(franceSeedId, "What is the capital of France?", "Paris", ["Lyon", "Marseille", "Nice"], explanation: "Updated explanation."),
                BuildItem(germanySeedId, "What is the capital of Germany?", "Berlin", ["Munich", "Hamburg", "Frankfurt"]),
                BuildItem(spainSeedId, "What is the capital of Spain?", "Madrid", ["Barcelona", "Valencia", "Seville"])
            ]);

        var preview = await _service.PreviewAsync(updatedRequest, CancellationToken.None);

        preview.IsSuccess.Should().BeTrue();
        preview.Value!.IsInitialSeed.Should().BeFalse();
        preview.Value.PreviewSuppressed.Should().BeFalse();
        preview.Value.CreatedCount.Should().Be(1);
        preview.Value.UpdatedCount.Should().Be(1);
        preview.Value.UnchangedCount.Should().Be(1);
        preview.Value.Changes.Should().HaveCount(2);
        preview.Value.Changes.Should().OnlyContain(change => change.Action == "Created" || change.Action == "Updated");
        preview.Value.Changes.Should().Contain(change =>
            change.SeedId == franceSeedId && change.ChangedFields.Contains("explanation"));
        preview.Value.Changes.Should().Contain(change => change.SeedId == spainSeedId && change.Action == "Created");
    }

    [Fact]
    public async Task ApplyAsync_RecreatesSeedManagedItem_WhenRemovedFromDatabase()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");

        Guid seedId = Guid.Parse("77777777-7777-7777-7777-777777777777");
        SeedSyncAdmin.Request request = BuildRequest(
            "core-geography",
            [
                BuildItem(seedId, "What is the capital of Portugal?", "Lisbon", ["Porto", "Braga", "Coimbra"])
            ]);

        var firstApply = await _service.ApplyAsync(request, CancellationToken.None);
        firstApply.IsSuccess.Should().BeTrue();

        Item existing = await DbContext.Items
            .Include(i => i.ItemKeywords)
            .SingleAsync(i => i.SeedId == seedId);

        DbContext.ItemKeywords.RemoveRange(existing.ItemKeywords);
        DbContext.Items.Remove(existing);
        await DbContext.SaveChangesAsync();

        var secondApply = await _service.ApplyAsync(request, CancellationToken.None);

        secondApply.IsSuccess.Should().BeTrue();
        secondApply.Value!.CreatedCount.Should().Be(1);

        int itemCount = await DbContext.Items.CountAsync(i => i.SeedId == seedId);
        itemCount.Should().Be(1);
        DbContext.Items.Should().Contain(i => i.SeedId == seedId && i.IsSeedManaged);
    }

    private static SeedSyncAdmin.Request BuildRequest(
        string seedSet,
        List<SeedSyncAdmin.SeedItemRequest> items)
    {
        return new SeedSyncAdmin.Request(
            SchemaVersion: 1,
            SeedSet: seedSet,
            Items: items,
            DeltaPreviewLimit: 50);
    }

    private static SeedSyncAdmin.SeedItemRequest BuildItem(
        Guid seedId,
        string question,
        string correctAnswer,
        List<string> incorrectAnswers,
        string? explanation = null,
        List<string>? keywords = null)
    {
        return new SeedSyncAdmin.SeedItemRequest(
            SeedId: seedId,
            Category: "geography",
            NavigationKeyword1: "capitals",
            NavigationKeyword2: "europe",
            Question: question,
            CorrectAnswer: correctAnswer,
            IncorrectAnswers: incorrectAnswers,
            Explanation: explanation,
            Keywords: keywords,
            Source: "seed-test");
    }
}
