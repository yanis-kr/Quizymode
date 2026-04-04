using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class GetCategoryKeywordsAdminTests : DatabaseTestFixture
{
    private async Task<(Category category, Keyword root, Keyword child)> SeedCategoryWithKeywordsAsync(string catName = "science")
    {
        Category category = new() { Id = Guid.NewGuid(), Name = catName, IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword root = new() { Id = Guid.NewGuid(), Name = "biology", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword child = new() { Id = Guid.NewGuid(), Name = "genetics", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword other = new() { Id = Guid.NewGuid(), Name = "other", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Keywords.AddRange(root, child, other);
        DbContext.KeywordRelations.AddRange(
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null, ChildKeywordId = root.Id, CreatedAt = DateTime.UtcNow },
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = root.Id, ChildKeywordId = child.Id, CreatedAt = DateTime.UtcNow },
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null, ChildKeywordId = other.Id, CreatedAt = DateTime.UtcNow });
        await DbContext.SaveChangesAsync();
        return (category, root, child);
    }

    [Fact]
    public async Task HandleAsync_NoRelations_ReturnsEmpty()
    {
        var result = await GetCategoryKeywordsAdmin.HandleAsync(DbContext, null, null, false, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_ExcludesOtherKeyword()
    {
        await SeedCategoryWithKeywordsAsync();

        var result = await GetCategoryKeywordsAdmin.HandleAsync(DbContext, null, null, false, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().NotContain(k => k.KeywordName == "other");
    }

    [Fact]
    public async Task HandleAsync_FiltersByCategoryName()
    {
        await SeedCategoryWithKeywordsAsync("science");
        Category other = new() { Id = Guid.NewGuid(), Name = "history", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword kw = new() { Id = Guid.NewGuid(), Name = "wars", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(other);
        DbContext.Keywords.Add(kw);
        DbContext.KeywordRelations.Add(new KeywordRelation { Id = Guid.NewGuid(), CategoryId = other.Id, ParentKeywordId = null, ChildKeywordId = kw.Id, CreatedAt = DateTime.UtcNow });
        await DbContext.SaveChangesAsync();

        var result = await GetCategoryKeywordsAdmin.HandleAsync(DbContext, "science", null, false, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().OnlyContain(k => k.CategoryName == "science");
    }

    [Fact]
    public async Task HandleAsync_FiltersByRank1_ReturnsOnlyRootKeywords()
    {
        await SeedCategoryWithKeywordsAsync();

        var result = await GetCategoryKeywordsAdmin.HandleAsync(DbContext, null, 1, false, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().OnlyContain(k => k.NavigationRank == 1);
    }

    [Fact]
    public async Task HandleAsync_FiltersByRank2_ReturnsOnlyChildKeywords()
    {
        await SeedCategoryWithKeywordsAsync();

        var result = await GetCategoryKeywordsAdmin.HandleAsync(DbContext, null, 2, false, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().OnlyContain(k => k.NavigationRank == 2);
    }

    [Fact]
    public async Task HandleAsync_PendingOnly_ReturnsPendingRelations()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "pending-cat", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword pendingKw = new() { Id = Guid.NewGuid(), Name = "pending-topic", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword approvedKw = new() { Id = Guid.NewGuid(), Name = "approved-topic", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Keywords.AddRange(pendingKw, approvedKw);
        DbContext.KeywordRelations.AddRange(
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null, ChildKeywordId = pendingKw.Id, IsReviewPending = true, CreatedAt = DateTime.UtcNow },
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null, ChildKeywordId = approvedKw.Id, IsReviewPending = false, CreatedAt = DateTime.UtcNow });
        await DbContext.SaveChangesAsync();

        var result = await GetCategoryKeywordsAdmin.HandleAsync(DbContext, null, null, pendingOnly: true, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().ContainSingle(k => k.KeywordName == "pending-topic");
    }
}
