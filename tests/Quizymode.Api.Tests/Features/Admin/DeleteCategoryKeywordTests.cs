using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class DeleteCategoryKeywordTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_RelationNotFound_ReturnsNotFound()
    {
        var result = await DeleteCategoryKeyword.HandleAsync(Guid.NewGuid(), DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.CategoryKeywordNotFound");
    }

    [Fact]
    public async Task HandleAsync_ExistingRelation_DeletesRelation()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "sci", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword keyword = new() { Id = Guid.NewGuid(), Name = "bio", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        KeywordRelation relation = new() { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null, ChildKeywordId = keyword.Id, CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Keywords.Add(keyword);
        DbContext.KeywordRelations.Add(relation);
        await DbContext.SaveChangesAsync();

        var result = await DeleteCategoryKeyword.HandleAsync(relation.Id, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.KeywordRelations.Should().NotContain(kr => kr.Id == relation.Id);
        // Keyword and category remain
        DbContext.Keywords.Should().Contain(k => k.Id == keyword.Id);
        DbContext.Categories.Should().Contain(c => c.Id == category.Id);
    }
}
