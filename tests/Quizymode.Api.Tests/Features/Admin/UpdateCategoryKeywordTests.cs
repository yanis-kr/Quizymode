using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class UpdateCategoryKeywordTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AdminUser(string userId = "admin-1")
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.UserId).Returns(userId);
        return ctx;
    }

    private async Task<(Category cat, Keyword root, Keyword child, KeywordRelation rootRel, KeywordRelation childRel)> SeedAsync()
    {
        Category cat = new() { Id = Guid.NewGuid(), Name = "sci", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword root = new() { Id = Guid.NewGuid(), Name = "bio", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword child = new() { Id = Guid.NewGuid(), Name = "genetics", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(cat);
        DbContext.Keywords.AddRange(root, child);
        KeywordRelation rootRel = new() { Id = Guid.NewGuid(), CategoryId = cat.Id, ParentKeywordId = null, ChildKeywordId = root.Id, CreatedAt = DateTime.UtcNow };
        KeywordRelation childRel = new() { Id = Guid.NewGuid(), CategoryId = cat.Id, ParentKeywordId = root.Id, ChildKeywordId = child.Id, IsPrivate = true, IsReviewPending = true, CreatedAt = DateTime.UtcNow };
        DbContext.KeywordRelations.AddRange(rootRel, childRel);
        await DbContext.SaveChangesAsync();
        return (cat, root, child, rootRel, childRel);
    }

    [Fact]
    public async Task HandleAsync_RelationNotFound_ReturnsNotFound()
    {
        var request = new UpdateCategoryKeyword.UpdateCategoryKeywordRequest(null, null);

        var result = await UpdateCategoryKeyword.HandleAsync(Guid.NewGuid(), request, DbContext, AdminUser().Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.CategoryKeywordNotFound");
    }

    [Fact]
    public async Task HandleAsync_InvalidParent_ReturnsValidationError()
    {
        var (_, _, _, rootRel, _) = await SeedAsync();
        Keyword unrelated = new() { Id = Guid.NewGuid(), Name = "chemistry", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Keywords.Add(unrelated);
        await DbContext.SaveChangesAsync();

        var request = new UpdateCategoryKeyword.UpdateCategoryKeywordRequest(ParentKeywordId: unrelated.Id, null);

        var result = await UpdateCategoryKeyword.HandleAsync(rootRel.Id, request, DbContext, AdminUser().Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.InvalidParent");
    }

    [Fact]
    public async Task HandleAsync_UpdatesSortRank()
    {
        var (_, _, _, rootRel, _) = await SeedAsync();

        var request = new UpdateCategoryKeyword.UpdateCategoryKeywordRequest(null, SortRank: 5);

        var result = await UpdateCategoryKeyword.HandleAsync(rootRel.Id, request, DbContext, AdminUser().Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.SortRank.Should().Be(5);
    }

    [Fact]
    public async Task HandleAsync_UpdatesDescription()
    {
        var (_, _, _, rootRel, _) = await SeedAsync();

        var request = new UpdateCategoryKeyword.UpdateCategoryKeywordRequest(null, null, Description: "A biology keyword");

        var result = await UpdateCategoryKeyword.HandleAsync(rootRel.Id, request, DbContext, AdminUser().Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Description.Should().Be("A biology keyword");
    }

    [Fact]
    public async Task HandleAsync_Approve_ClearsPrivateAndPending()
    {
        var (_, _, _, _, childRel) = await SeedAsync();

        var request = new UpdateCategoryKeyword.UpdateCategoryKeywordRequest(null, null, Approve: true);

        var result = await UpdateCategoryKeyword.HandleAsync(childRel.Id, request, DbContext, AdminUser("admin-x").Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.IsPrivate.Should().BeFalse();
        result.Value.IsReviewPending.Should().BeFalse();

        KeywordRelation? stored = await DbContext.KeywordRelations.FindAsync(childRel.Id);
        stored!.IsPrivate.Should().BeFalse();
        stored.IsReviewPending.Should().BeFalse();
        stored.ReviewedBy.Should().Be("admin-x");
    }
}
