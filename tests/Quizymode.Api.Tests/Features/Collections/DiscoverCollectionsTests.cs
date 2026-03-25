using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class DiscoverCollectionsTests : ItemTestFixture
{
    [Fact]
    public async Task HandleAsync_NoItemFilters_ReturnsPublicCollections()
    {
        Mock<IUserContext> ctx = CreateAnonymousContext();
        Item item = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "u1");
        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "Pub",
            IsPublic = true,
            CreatedBy = "u1",
            CreatedAt = DateTime.UtcNow,
        };
        DbContext.Collections.Add(col);
        DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = col.Id, ItemId = item.Id });
        await DbContext.SaveChangesAsync();

        Result<DiscoverCollections.Response> result = await DiscoverCollections.HandleAsync(
            "",
            null,
            null,
            null,
            1,
            20,
            DbContext,
            ctx.Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.TotalCount.Should().Be(1);
        result.Value.Items.Should().ContainSingle(i => i.Id == col.Id.ToString());
    }

    [Fact]
    public async Task HandleAsync_FilterByCategory_FindsCollectionWhenAnyItemMatches()
    {
        Mock<IUserContext> ctx = CreateAnonymousContext();
        Item geo = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "u1");
        Item hist = await CreateItemWithCategoryAsync("history", "Q2", "A2", new List<string>(), "", isPrivate: false, createdBy: "u1");
        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "Mixed",
            IsPublic = true,
            CreatedBy = "u1",
            CreatedAt = DateTime.UtcNow,
        };
        DbContext.Collections.Add(col);
        DbContext.CollectionItems.AddRange(
            new CollectionItem { Id = Guid.NewGuid(), CollectionId = col.Id, ItemId = geo.Id },
            new CollectionItem { Id = Guid.NewGuid(), CollectionId = col.Id, ItemId = hist.Id });
        await DbContext.SaveChangesAsync();

        Result<DiscoverCollections.Response> result = await DiscoverCollections.HandleAsync(
            "",
            "geography",
            null,
            null,
            1,
            20,
            DbContext,
            ctx.Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.TotalCount.Should().Be(1);
        result.Value.Items[0].Id.Should().Be(col.Id.ToString());
    }

    [Fact]
    public async Task HandleAsync_KeywordsWithoutCategory_ReturnsValidationError()
    {
        Mock<IUserContext> ctx = CreateAnonymousContext();

        Result<DiscoverCollections.Response> result = await DiscoverCollections.HandleAsync(
            "",
            null,
            "topics",
            null,
            1,
            20,
            DbContext,
            ctx.Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Collections.Discover.KeywordsRequireCategory");
    }

    [Fact]
    public async Task HandleAsync_FilterByTag_RequiresItemKeyword()
    {
        Mock<IUserContext> ctx = CreateAnonymousContext();
        Item item = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "u1");

        Keyword tagKw = new()
        {
            Id = Guid.NewGuid(),
            Name = "s3",
            IsPrivate = false,
            CreatedBy = "u1",
            CreatedAt = DateTime.UtcNow,
        };
        DbContext.Keywords.Add(tagKw);
        DbContext.ItemKeywords.Add(new ItemKeyword { Id = Guid.NewGuid(), ItemId = item.Id, KeywordId = tagKw.Id });
        await DbContext.SaveChangesAsync();

        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "Tagged",
            IsPublic = true,
            CreatedBy = "u1",
            CreatedAt = DateTime.UtcNow,
        };
        DbContext.Collections.Add(col);
        DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = col.Id, ItemId = item.Id });
        await DbContext.SaveChangesAsync();

        Result<DiscoverCollections.Response> match = await DiscoverCollections.HandleAsync(
            "",
            null,
            null,
            "s3",
            1,
            20,
            DbContext,
            ctx.Object,
            CancellationToken.None);

        match.IsSuccess.Should().BeTrue();
        match.Value.TotalCount.Should().Be(1);

        Result<DiscoverCollections.Response> noMatch = await DiscoverCollections.HandleAsync(
            "",
            null,
            null,
            "ec2",
            1,
            20,
            DbContext,
            ctx.Object,
            CancellationToken.None);

        noMatch.IsSuccess.Should().BeTrue();
        noMatch.Value.TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_TextQueryAndCategory_AndSemantics()
    {
        Mock<IUserContext> ctx = CreateAnonymousContext();
        Item item = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "u1");
        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "Alpha Set",
            IsPublic = true,
            CreatedBy = "u1",
            CreatedAt = DateTime.UtcNow,
        };
        DbContext.Collections.Add(col);
        DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = col.Id, ItemId = item.Id });
        await DbContext.SaveChangesAsync();

        Result<DiscoverCollections.Response> hit = await DiscoverCollections.HandleAsync(
            "alpha",
            "geography",
            null,
            null,
            1,
            20,
            DbContext,
            ctx.Object,
            CancellationToken.None);

        hit.Value.TotalCount.Should().Be(1);

        Result<DiscoverCollections.Response> miss = await DiscoverCollections.HandleAsync(
            "beta",
            "geography",
            null,
            null,
            1,
            20,
            DbContext,
            ctx.Object,
            CancellationToken.None);

        miss.Value.TotalCount.Should().Be(0);
    }

    private static Mock<IUserContext> CreateAnonymousContext()
    {
        Mock<IUserContext> mock = new();
        mock.Setup(x => x.UserId).Returns((string?)null);
        mock.Setup(x => x.IsAuthenticated).Returns(false);
        mock.Setup(x => x.IsAdmin).Returns(false);
        return mock;
    }
}
