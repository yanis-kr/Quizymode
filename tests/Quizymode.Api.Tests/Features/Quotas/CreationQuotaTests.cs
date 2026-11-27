using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Features.Items.Add;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Quotas;

// AC 17.4 and 17.5 (#904): what counts toward a daily quota.
public sealed class CreationQuotaTests : ItemTestFixture
{
    private static readonly string UserId = Guid.NewGuid().ToString();

    private static IUserContext Member() => Mock.Of<IUserContext>(user => user.UserId == UserId && user.IsAuthenticated);

    private static QuotaSettings Limits(int limit) =>
        new() { ItemsPerDay = limit, CollectionsPerDay = limit, CommentsPerDay = limit };

    private Task<Result<AddCollection.Response>> AddCollectionAsync(string name, int limit) =>
        AddCollection.HandleAsync(
            new AddCollection.Request(name), DbContext, Member(), NullLogger<AddCollection.Endpoint>.Instance,
            CancellationToken.None, Limits(limit));

    private Task<Result<AddItem.Response>> AddItemAsync(string question, int limit, Guid? requestId = null) =>
        AddItemHandler.HandleAsync(
            new AddItem.Request("geography", "capitals", "europe", true, question, "Paris", ["Lyon"], "", CreateRequestId: requestId),
            DbContext, SimHashService, Member(), Mock.Of<IAuditService>(), TaxonomyItemCategoryResolver, TaxonomyRegistry,
            CancellationToken.None, Limits(limit));

    private async Task<Collection> SeedCollectionAsync(DateTime createdAt, bool autoCreated = false)
    {
        Collection collection = new()
        {
            Id = Guid.NewGuid(),
            Name = "Seeded",
            CreatedBy = UserId,
            CreatedAt = createdAt,
            IsAutoCreated = autoCreated
        };
        DbContext.Collections.Add(collection);
        await DbContext.SaveChangesAsync();
        return collection;
    }

    [Fact]
    public async Task NthCreationSucceeds_TheNextIsRefused_AndDeletingARowFreesItsPlace()
    {
        (await AddCollectionAsync("One", 2)).IsSuccess.Should().BeTrue();
        Result<AddCollection.Response> second = await AddCollectionAsync("Two", 2);
        second.IsSuccess.Should().BeTrue();

        Result<AddCollection.Response> third = await AddCollectionAsync("Three", 2);

        third.IsFailure.Should().BeTrue();
        third.Error.Code.Should().Be("Quota.CollectionsPerDay");
        third.Error.Description.Should().Contain("2 collections per day");
        (await DbContext.Collections.CountAsync()).Should().Be(2);

        Guid secondId = Guid.Parse(second.Value.Id);
        DbContext.Collections.Remove(await DbContext.Collections.SingleAsync(c => c.Id == secondId));
        await DbContext.SaveChangesAsync();
        (await AddCollectionAsync("Three", 2)).IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task YesterdaysRowsAndTheAutomaticDefaultCollection_DoNotCount()
    {
        await SeedCollectionAsync(DateTime.UtcNow.Date.AddSeconds(-1));
        await SeedCollectionAsync(DateTime.UtcNow, autoCreated: true);

        (await AddCollectionAsync("Today", 1)).IsSuccess.Should().BeTrue();
        (await AddCollectionAsync("Over", 1)).Error.Code.Should().Be("Quota.CollectionsPerDay");
    }

    [Fact]
    public async Task DefaultCollectionFromTheFactory_IsMarkedAutoCreated()
    {
        DefaultCollectionFactory.Create(UserId, "Sam").IsAutoCreated.Should().BeTrue();

        // GET /collections creates the default collection when the user has none.
        await GetCollections.HandleAsync(DbContext, Member(), CancellationToken.None);

        (await DbContext.Collections.SingleAsync()).IsAutoCreated.Should().BeTrue();
        (await AddCollectionAsync("Mine", 1)).IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task YesterdaysComments_DoNotCount()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");
        Item item = await CreateItemWithCategoryAsync(
            "geography", "Question", "Answer", ["Wrong"], "", isPrivate: false, createdBy: "seeder");
        DbContext.Comments.Add(new Comment
        {
            Id = Guid.NewGuid(), ItemId = item.Id, Text = "Old", CreatedBy = UserId, CreatedAt = DateTime.UtcNow.Date.AddSeconds(-1)
        });
        await DbContext.SaveChangesAsync();

        Task<Result<AddComment.Response>> Add() => AddComment.HandleAsync(
            new AddComment.Request(item.Id, "New"), DbContext, Member(), Mock.Of<IAuditService>(), CancellationToken.None, Limits(1));

        (await Add()).IsSuccess.Should().BeTrue();
        (await Add()).Error.Code.Should().Be("Quota.CommentsPerDay");
        (await DbContext.Comments.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task ReplayedCreateRequest_AtQuota_ReturnsThePriorItem()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");
        Guid requestId = Guid.NewGuid();
        Result<AddItem.Response> first = await AddItemAsync("What is the capital of France?", 1, requestId);
        first.IsSuccess.Should().BeTrue(first.IsFailure ? first.Error.Description : null);

        Result<AddItem.Response> replay = await AddItemAsync("What is the capital of France?", 1, requestId);

        replay.IsSuccess.Should().BeTrue();
        replay.Value.Id.Should().Be(first.Value.Id);
        (await AddItemAsync("Which river flows through Cairo?", 1)).Error.Code.Should().Be("Quota.ItemsPerDay");
        (await DbContext.Items.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task BulkRequestCrossingTheQuota_IsRefusedWhole()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");
        (await AddItemAsync("What is the capital of France?", 3)).IsSuccess.Should().BeTrue();

        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            new AddItemsBulk.Request(
                true, "geography", "capitals", "europe", [],
                Enumerable.Range(1, 3)
                    .Select(i => new AddItemsBulk.ItemRequest($"Bulk question number {i}?", $"Answer {i}", ["Wrong"], ""))
                    .ToList()),
            DbContext, SimHashService, Member(), TaxonomyItemCategoryResolver, TaxonomyRegistry, Mock.Of<IAuditService>(),
            NullLogger.Instance, CancellationToken.None, Limits(3));

        result.Error.Code.Should().Be("Quota.ItemsPerDay");
        (await DbContext.Items.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task OmittedSettings_MeanTheDefaultQuota_NotNoQuota()
    {
        DbContext.Collections.AddRange(Enumerable.Range(0, 50).Select(i => new Collection
        {
            Id = Guid.NewGuid(), Name = $"C{i}", CreatedBy = UserId, CreatedAt = DateTime.UtcNow
        }));
        await DbContext.SaveChangesAsync();

        Result<AddCollection.Response> result = await AddCollection.HandleAsync(
            new AddCollection.Request("Fifty-one"), DbContext, Member(), NullLogger<AddCollection.Endpoint>.Instance,
            CancellationToken.None);

        result.Error.Code.Should().Be("Quota.CollectionsPerDay");
    }
}
