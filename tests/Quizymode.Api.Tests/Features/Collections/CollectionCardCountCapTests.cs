using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>AC 1.16.7: collection cards apply the same read cap as the roster, so a card count matches what the detail read lists.</summary>
public sealed class CollectionCardCountCapTests : ItemTestFixture
{
    private const string Owner = "owner-user";

    [Fact]
    public async Task CardCount_Beyond50Collections_MatchesTheCappedRoster()
    {
        Collection root = new() { Id = Guid.NewGuid(), Name = "root", CreatedBy = Owner, CreatedAt = DateTime.UtcNow, IsPublic = true };
        DbContext.Collections.Add(root);
        for (int i = 0; i < 60; i++)
        {
            Collection child = new() { Id = Guid.NewGuid(), Name = $"child-{i}", CreatedBy = Owner, CreatedAt = DateTime.UtcNow, IsPublic = true };
            DbContext.Collections.Add(child);
            Item item = await CreateItemWithCategoryAsync("geography", $"Q{i}", "A", new List<string>(), "", isPrivate: false, createdBy: Owner);
            DbContext.CollectionItems.Add(new CollectionItem { Id = Guid.NewGuid(), CollectionId = child.Id, ItemId = item.Id });
            DbContext.CollectionCollectionMembers.Add(new CollectionCollectionMember { Id = Guid.NewGuid(), ParentId = root.Id, ChildId = child.Id });
        }
        await DbContext.SaveChangesAsync();

        Dictionary<Guid, CollectionCardCounts.Counts> counts =
            await CollectionCardCounts.ForCollectionsAsync(DbContext, [root.Id], Owner, CancellationToken.None);
        int roster = await CollectionScope.AccessibleMemberItemIds(DbContext, root.Id, Owner).CountAsync();

        // The root plus 49 children is the cap; each child holds one question.
        roster.Should().Be(49);
        counts[root.Id].ItemCount.Should().Be(roster, "the card reads the same capped set as the roster");
    }
}
