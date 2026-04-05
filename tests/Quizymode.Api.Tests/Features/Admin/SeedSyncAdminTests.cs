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
    public async Task PreviewAsync_InitialSeed_ReturnsCreatedDeltaForExplicitItemIds()
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
        result.Value!.ExistingItemCount.Should().Be(0);
        result.Value.CreatedCount.Should().Be(2);
        result.Value.UpdatedCount.Should().Be(0);
        result.Value.UnchangedCount.Should().Be(0);
        result.Value.HasMoreChanges.Should().BeFalse();
        result.Value.Changes.Should().HaveCount(2);
        result.Value.Changes.Should().OnlyContain(change => change.Action == "Created");
    }

    [Fact]
    public async Task ApplyAsync_UpsertsSeederOwnedPublicItems_AndCreatesPublicKeywords()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");

        Guid itemId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        SeedSyncAdmin.Request request = BuildRequest(
            "core-geography",
            [
                BuildItem(
                    itemId,
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

        item.Id.Should().Be(itemId);
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

        Guid franceItemId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        Guid germanyItemId = Guid.Parse("55555555-5555-5555-5555-555555555555");
        Guid spainItemId = Guid.Parse("66666666-6666-6666-6666-666666666666");

        SeedSyncAdmin.Request initialRequest = BuildRequest(
            "core-geography",
            [
                BuildItem(franceItemId, "What is the capital of France?", "Paris", ["Lyon", "Marseille", "Nice"], explanation: "Initial explanation."),
                BuildItem(germanyItemId, "What is the capital of Germany?", "Berlin", ["Munich", "Hamburg", "Frankfurt"])
            ]);

        var initialApply = await _service.ApplyAsync(initialRequest, CancellationToken.None);
        initialApply.IsSuccess.Should().BeTrue();

        SeedSyncAdmin.Request updatedRequest = BuildRequest(
            "core-geography",
            [
                BuildItem(franceItemId, "What is the capital of France?", "Paris", ["Lyon", "Marseille", "Nice"], explanation: "Updated explanation."),
                BuildItem(germanyItemId, "What is the capital of Germany?", "Berlin", ["Munich", "Hamburg", "Frankfurt"]),
                BuildItem(spainItemId, "What is the capital of Spain?", "Madrid", ["Barcelona", "Valencia", "Seville"])
            ]);

        var preview = await _service.PreviewAsync(updatedRequest, CancellationToken.None);

        preview.IsSuccess.Should().BeTrue();
        preview.Value!.ExistingItemCount.Should().Be(2);
        preview.Value.CreatedCount.Should().Be(1);
        preview.Value.UpdatedCount.Should().Be(1);
        preview.Value.UnchangedCount.Should().Be(1);
        preview.Value.Changes.Should().HaveCount(2);
        preview.Value.Changes.Should().OnlyContain(change => change.Action == "Created" || change.Action == "Updated");
        preview.Value.Changes.Should().Contain(change =>
            change.ItemId == franceItemId && change.ChangedFields.Contains("explanation"));
        preview.Value.Changes.Should().Contain(change => change.ItemId == spainItemId && change.Action == "Created");
    }

    [Fact]
    public async Task ApplyAsync_RecreatesSeederOwnedItem_WhenRemovedFromDatabase()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");

        Guid itemId = Guid.Parse("77777777-7777-7777-7777-777777777777");
        SeedSyncAdmin.Request request = BuildRequest(
            "core-geography",
            [
                BuildItem(itemId, "What is the capital of Portugal?", "Lisbon", ["Porto", "Braga", "Coimbra"])
            ]);

        var firstApply = await _service.ApplyAsync(request, CancellationToken.None);
        firstApply.IsSuccess.Should().BeTrue();

        Item existing = await DbContext.Items
            .Include(i => i.ItemKeywords)
            .SingleAsync(i => i.Id == itemId);

        DbContext.ItemKeywords.RemoveRange(existing.ItemKeywords);
        DbContext.Items.Remove(existing);
        await DbContext.SaveChangesAsync();

        var secondApply = await _service.ApplyAsync(request, CancellationToken.None);

        secondApply.IsSuccess.Should().BeTrue();
        secondApply.Value!.CreatedCount.Should().Be(1);

        int itemCount = await DbContext.Items.CountAsync(i => i.Id == itemId);
        itemCount.Should().Be(1);
        DbContext.Items.Should().Contain(i => i.Id == itemId && i.CreatedBy == "seeder" && !i.IsPrivate);
    }

    [Fact]
    public async Task ApplyAsync_ReturnsValidationError_WhenItemIdAlreadyBelongsToNonSeederItem()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");

        Guid conflictingItemId = Guid.Parse("88888888-8888-8888-8888-888888888888");
        Item existing = await CreateItemWithCategoryAsync(
            itemId: conflictingItemId,
            categoryName: "geography",
            question: "Legacy row with conflicting item id",
            correctAnswer: "Paris",
            incorrectAnswers: ["Lyon", "Marseille", "Nice"],
            explanation: "Legacy explanation.",
            isPrivate: false,
            createdBy: "seed-import");
        await DbContext.SaveChangesAsync();

        SeedSyncAdmin.Request request = BuildRequest(
            "core-geography",
            [
                BuildItem(
                    conflictingItemId,
                    "What is the capital of France?",
                    "Paris",
                    ["Lyon", "Marseille", "Nice"])
            ]);

        var result = await _service.ApplyAsync(request, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Should().NotBeNull();
        result.Error!.Code.Should().Be("Admin.ItemSyncIdConflict");
        result.Error.Description.Should().Contain(conflictingItemId.ToString());
        existing.Id.Should().Be(conflictingItemId);
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
        Guid itemId,
        string question,
        string correctAnswer,
        List<string> incorrectAnswers,
        string? explanation = null,
        List<string>? keywords = null)
    {
        return new SeedSyncAdmin.SeedItemRequest(
            ItemId: itemId,
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
