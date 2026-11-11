using FluentAssertions;
using Quizymode.Api.Features.Featured;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Featured;

/// <summary>#555: featured collection counts use the same lead total as GET /collections/{id} for an anonymous viewer.</summary>
public sealed class GetFeaturedCountTests : ItemTestFixture
{
    [Fact]
    public async Task Featured_CollectionItemCount_IncludesNestedContent_AndHidesOthersPrivateQuestions()
    {
        Collection parent = new() { Id = Guid.NewGuid(), Name = "Capitals", CreatedBy = "owner", CreatedAt = DateTime.UtcNow, IsPublic = true };
        Collection child = new() { Id = Guid.NewGuid(), Name = "Europe", CreatedBy = "owner", CreatedAt = DateTime.UtcNow, IsPublic = true };
        DbContext.Collections.AddRange(parent, child);

        Item direct = await CreateItemWithCategoryAsync("geography", "Direct", "A", new List<string>(), "", isPrivate: false, createdBy: "owner");
        Item nested = await CreateItemWithCategoryAsync("geography", "Nested", "A", new List<string>(), "", isPrivate: false, createdBy: "owner");
        Item stranger = await CreateItemWithCategoryAsync("geography", "Stranger private", "A", new List<string>(), "", isPrivate: true, createdBy: "stranger");

        DbContext.CollectionItems.AddRange(
            new CollectionItem { Id = Guid.NewGuid(), CollectionId = parent.Id, ItemId = direct.Id, AddedAt = DateTime.UtcNow },
            new CollectionItem { Id = Guid.NewGuid(), CollectionId = parent.Id, ItemId = stranger.Id, AddedAt = DateTime.UtcNow },
            new CollectionItem { Id = Guid.NewGuid(), CollectionId = child.Id, ItemId = nested.Id, AddedAt = DateTime.UtcNow });
        DbContext.CollectionCollectionMembers.Add(new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = parent.Id, ChildId = child.Id });
        DbContext.FeaturedItems.Add(new FeaturedItem
        {
            Id = Guid.NewGuid(),
            Type = FeaturedItemType.Collection,
            DisplayName = "Capitals",
            CollectionId = parent.Id,
            SortOrder = 1,
            CreatedBy = "admin"
        });
        await DbContext.SaveChangesAsync();

        Result<GetFeatured.Response> result = await GetFeatured.HandleAsync(DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        GetFeatured.FeaturedCollectionDto card = result.Value.Collections.Single(c => c.CollectionId == parent.Id);
        card.ItemCount.Should().Be(2, "direct and nested questions count; another user's private question does not");
    }
}
