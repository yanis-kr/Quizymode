using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class CreateCategoryKeywordTests : DatabaseTestFixture
{
    private async Task<(Category category, Keyword keyword)> CreateCategoryAndKeywordAsync(string catName = "science", string kwName = "biology")
    {
        Category category = new() { Id = Guid.NewGuid(), Name = catName, IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword keyword = new() { Id = Guid.NewGuid(), Name = kwName, IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Keywords.Add(keyword);
        await DbContext.SaveChangesAsync();
        return (category, keyword);
    }

    [Fact]
    public async Task HandleAsync_KeywordNotFound_ReturnsNotFound()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "cat", IsPrivate = false, CreatedBy = "admin" };
        DbContext.Categories.Add(category);
        await DbContext.SaveChangesAsync();

        var request = new CreateCategoryKeyword.CreateCategoryKeywordRequest(category.Id, null, Guid.NewGuid());

        var result = await CreateCategoryKeyword.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.KeywordNotFound");
    }

    [Fact]
    public async Task HandleAsync_OtherKeyword_ReturnsValidationError()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "cat", IsPrivate = false, CreatedBy = "admin" };
        Keyword other = new() { Id = Guid.NewGuid(), Name = "other", IsPrivate = false, CreatedBy = "admin" };
        DbContext.Categories.Add(category);
        DbContext.Keywords.Add(other);
        await DbContext.SaveChangesAsync();

        var request = new CreateCategoryKeyword.CreateCategoryKeywordRequest(category.Id, null, other.Id);

        var result = await CreateCategoryKeyword.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.KeywordOtherNotAllowed");
    }

    [Fact]
    public async Task HandleAsync_CategoryNotFound_ReturnsNotFound()
    {
        Keyword keyword = new() { Id = Guid.NewGuid(), Name = "biology", IsPrivate = false, CreatedBy = "admin" };
        DbContext.Keywords.Add(keyword);
        await DbContext.SaveChangesAsync();

        var request = new CreateCategoryKeyword.CreateCategoryKeywordRequest(Guid.NewGuid(), null, keyword.Id);

        var result = await CreateCategoryKeyword.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.CategoryNotFound");
    }

    [Fact]
    public async Task HandleAsync_RelationAlreadyExists_ReturnsValidationError()
    {
        var (category, keyword) = await CreateCategoryAndKeywordAsync();
        DbContext.KeywordRelations.Add(new KeywordRelation
        {
            Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null,
            ChildKeywordId = keyword.Id, CreatedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        var request = new CreateCategoryKeyword.CreateCategoryKeywordRequest(category.Id, null, keyword.Id);

        var result = await CreateCategoryKeyword.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.CategoryKeywordAlreadyExists");
    }

    [Fact]
    public async Task HandleAsync_InvalidParent_ReturnsValidationError()
    {
        var (category, keyword) = await CreateCategoryAndKeywordAsync();
        Keyword parent = new() { Id = Guid.NewGuid(), Name = "zoology", IsPrivate = false, CreatedBy = "admin" };
        DbContext.Keywords.Add(parent);
        await DbContext.SaveChangesAsync();

        // Parent is not a root keyword of category
        var request = new CreateCategoryKeyword.CreateCategoryKeywordRequest(category.Id, parent.Id, keyword.Id);

        var result = await CreateCategoryKeyword.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.InvalidParent");
    }

    [Fact]
    public async Task HandleAsync_RootRelation_CreatesSuccessfully()
    {
        var (category, keyword) = await CreateCategoryAndKeywordAsync();

        var request = new CreateCategoryKeyword.CreateCategoryKeywordRequest(category.Id, null, keyword.Id, SortRank: 1);

        var result = await CreateCategoryKeyword.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.NavigationRank.Should().Be(1);
        result.Value.ParentName.Should().BeNull();
        result.Value.SortRank.Should().Be(1);
        DbContext.KeywordRelations.Should().ContainSingle(kr => kr.CategoryId == category.Id && kr.ChildKeywordId == keyword.Id);
    }

    [Fact]
    public async Task HandleAsync_ChildRelation_CreatesSuccessfully()
    {
        var (category, parentKeyword) = await CreateCategoryAndKeywordAsync(kwName: "biology");
        Keyword childKeyword = new() { Id = Guid.NewGuid(), Name = "genetics", IsPrivate = false, CreatedBy = "admin" };
        DbContext.Keywords.Add(childKeyword);
        // Add root relation for parent
        DbContext.KeywordRelations.Add(new KeywordRelation
        {
            Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null,
            ChildKeywordId = parentKeyword.Id, CreatedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        var request = new CreateCategoryKeyword.CreateCategoryKeywordRequest(category.Id, parentKeyword.Id, childKeyword.Id);

        var result = await CreateCategoryKeyword.HandleAsync(request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.NavigationRank.Should().Be(2);
        result.Value.ParentName.Should().Be("biology");
    }
}
