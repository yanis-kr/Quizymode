using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class DeleteCategoryTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_CategoryNotFound_ReturnsNotFound()
    {
        var result = await DeleteCategory.HandleAsync(Guid.NewGuid(), DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.CategoryNotFound");
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAsync_CategoryWithItems_ReturnsConflict()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "Science", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Items.Add(new Item
        {
            Id = Guid.NewGuid(),
            Question = "Q?",
            CorrectAnswer = "A",
            IncorrectAnswers = new List<string> { "B" },
            Explanation = "",
            FuzzySignature = "abc",
            FuzzyBucket = 1,
            CreatedBy = "user",
            CreatedAt = DateTime.UtcNow,
            CategoryId = category.Id
        });
        await DbContext.SaveChangesAsync();

        var result = await DeleteCategory.HandleAsync(category.Id, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.CategoryHasItems");
        result.Error.Type.Should().Be(ErrorType.Conflict);
    }

    [Fact]
    public async Task HandleAsync_EmptyCategory_DeletesCategoryAndKeywordRelations()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "Unused", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword keyword = new() { Id = Guid.NewGuid(), Name = "topic", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Keywords.Add(keyword);
        DbContext.KeywordRelations.Add(new KeywordRelation
        {
            Id = Guid.NewGuid(),
            CategoryId = category.Id,
            ParentKeywordId = null,
            ChildKeywordId = keyword.Id,
            CreatedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        var result = await DeleteCategory.HandleAsync(category.Id, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.Categories.Should().NotContain(c => c.Id == category.Id);
        DbContext.KeywordRelations.Should().NotContain(kr => kr.CategoryId == category.Id);
        // Keyword entity is NOT deleted
        DbContext.Keywords.Should().Contain(k => k.Id == keyword.Id);
    }

    [Fact]
    public async Task HandleAsync_EmptyCategoryNoRelations_Succeeds()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "Empty", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        await DbContext.SaveChangesAsync();

        var result = await DeleteCategory.HandleAsync(category.Id, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.Categories.Should().BeEmpty();
    }
}
