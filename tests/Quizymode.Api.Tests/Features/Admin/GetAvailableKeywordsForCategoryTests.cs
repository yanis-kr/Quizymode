using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class GetAvailableKeywordsForCategoryTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_CategoryNotFound_ReturnsNotFound()
    {
        var result = await GetAvailableKeywordsForCategory.HandleAsync(Guid.NewGuid(), DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.CategoryNotFound");
    }

    [Fact]
    public async Task HandleAsync_NoKeywords_ReturnsEmpty()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "sci", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        await DbContext.SaveChangesAsync();

        var result = await GetAvailableKeywordsForCategory.HandleAsync(category.Id, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_ExcludesOtherKeyword()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "sci", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword other = new() { Id = Guid.NewGuid(), Name = "other", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword bio = new() { Id = Guid.NewGuid(), Name = "biology", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Keywords.AddRange(other, bio);
        await DbContext.SaveChangesAsync();

        var result = await GetAvailableKeywordsForCategory.HandleAsync(category.Id, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().ContainSingle(k => k.Name == "biology");
        result.Value.Keywords.Should().NotContain(k => k.Name == "other");
    }

    [Fact]
    public async Task HandleAsync_ExcludesAlreadyAssignedKeywords()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "sci", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword assigned = new() { Id = Guid.NewGuid(), Name = "biology", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword available = new() { Id = Guid.NewGuid(), Name = "chemistry", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Keywords.AddRange(assigned, available);
        DbContext.KeywordRelations.Add(new KeywordRelation
        {
            Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null,
            ChildKeywordId = assigned.Id, CreatedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        var result = await GetAvailableKeywordsForCategory.HandleAsync(category.Id, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().ContainSingle(k => k.Name == "chemistry");
        result.Value.Keywords.Should().NotContain(k => k.Name == "biology");
    }

    [Fact]
    public async Task HandleAsync_ReturnsKeywordsAlphabetically()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "sci", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Keywords.AddRange(
            new Keyword { Id = Guid.NewGuid(), Name = "zoology", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow },
            new Keyword { Id = Guid.NewGuid(), Name = "astronomy", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow },
            new Keyword { Id = Guid.NewGuid(), Name = "math", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow });
        await DbContext.SaveChangesAsync();

        var result = await GetAvailableKeywordsForCategory.HandleAsync(category.Id, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Select(k => k.Name).Should().BeInAscendingOrder();
    }
}
