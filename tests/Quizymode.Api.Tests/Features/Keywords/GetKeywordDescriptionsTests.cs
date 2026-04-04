using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Keywords;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Keywords;

public sealed class GetKeywordDescriptionsTests : DatabaseTestFixture
{
    private static Mock<IUserContext> UnauthenticatedUser()
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(false);
        ctx.SetupGet(x => x.UserId).Returns((string?)null);
        return ctx;
    }

    private static Mock<IUserContext> AuthenticatedUser(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId);
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_CategoryNotFound_ReturnsNotFound()
    {
        var result = await GetKeywordDescriptions.HandleAsync(
            "nonexistent", new List<string> { "biology" }, DbContext, UnauthenticatedUser().Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Keywords.CategoryNotFound");
    }

    [Fact]
    public async Task HandleAsync_EmptyKeywordList_ReturnsEmpty()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "science", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        await DbContext.SaveChangesAsync();

        var result = await GetKeywordDescriptions.HandleAsync(
            "science", new List<string>(), DbContext, UnauthenticatedUser().Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_ReturnsDescriptionsInRequestOrder()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "science", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword kw1 = new() { Id = Guid.NewGuid(), Name = "biology", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword kw2 = new() { Id = Guid.NewGuid(), Name = "astronomy", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Keywords.AddRange(kw1, kw2);
        DbContext.KeywordRelations.AddRange(
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null, ChildKeywordId = kw1.Id, Description = "Study of life", CreatedAt = DateTime.UtcNow },
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null, ChildKeywordId = kw2.Id, Description = "Study of stars", CreatedAt = DateTime.UtcNow });
        await DbContext.SaveChangesAsync();

        // Request astronomy first, biology second
        var result = await GetKeywordDescriptions.HandleAsync(
            "science", new List<string> { "astronomy", "biology" }, DbContext, UnauthenticatedUser().Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().HaveCount(2);
        result.Value.Keywords[0].Name.Should().Be("astronomy");
        result.Value.Keywords[0].Description.Should().Be("Study of stars");
        result.Value.Keywords[1].Name.Should().Be("biology");
        result.Value.Keywords[1].Description.Should().Be("Study of life");
    }

    [Fact]
    public async Task HandleAsync_KeywordNotInRelations_ReturnsNullDescription()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "science", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        await DbContext.SaveChangesAsync();

        var result = await GetKeywordDescriptions.HandleAsync(
            "science", new List<string> { "missingkw" }, DbContext, UnauthenticatedUser().Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().ContainSingle();
        result.Value.Keywords[0].Name.Should().Be("missingkw");
        result.Value.Keywords[0].Description.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_Unauthenticated_ExcludesPrivateRelations()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "science", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword kw = new() { Id = Guid.NewGuid(), Name = "biology", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        DbContext.Keywords.Add(kw);
        DbContext.KeywordRelations.Add(new KeywordRelation
        {
            Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null,
            ChildKeywordId = kw.Id, Description = "Private desc", IsPrivate = true,
            CreatedBy = "user-x", CreatedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        var result = await GetKeywordDescriptions.HandleAsync(
            "science", new List<string> { "biology" }, DbContext, UnauthenticatedUser().Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        // Private relation is excluded for unauthenticated user, so description is null
        result.Value!.Keywords.Should().ContainSingle(k => k.Name == "biology" && k.Description == null);
    }
}
