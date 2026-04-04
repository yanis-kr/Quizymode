using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Keywords;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Keywords;

public sealed class GetItemTagKeywordsTests : DatabaseTestFixture
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
        var result = await GetItemTagKeywords.HandleAsync("nonexistent", DbContext, UnauthenticatedUser().Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Keywords.CategoryNotFound");
    }

    [Fact]
    public async Task HandleAsync_NoItemKeywords_ReturnsEmpty()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "science", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        await DbContext.SaveChangesAsync();

        var result = await GetItemTagKeywords.HandleAsync("science", DbContext, UnauthenticatedUser().Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Names.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_Unauthenticated_OnlyReturnsPublicKeywordsForPublicItems()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "science", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword publicKw = new() { Id = Guid.NewGuid(), Name = "biology", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword privateKw = new() { Id = Guid.NewGuid(), Name = "secret-kw", IsPrivate = true, CreatedBy = "user-1", CreatedAt = DateTime.UtcNow };

        Item publicItem = new()
        {
            Id = Guid.NewGuid(), Question = "Q?", CorrectAnswer = "A",
            IncorrectAnswers = new List<string> { "B" }, Explanation = "",
            FuzzySignature = "abc", FuzzyBucket = 1, CreatedBy = "user-1",
            CreatedAt = DateTime.UtcNow, CategoryId = category.Id, IsPrivate = false
        };
        Item privateItem = new()
        {
            Id = Guid.NewGuid(), Question = "Private Q?", CorrectAnswer = "A",
            IncorrectAnswers = new List<string> { "B" }, Explanation = "",
            FuzzySignature = "def", FuzzyBucket = 1, CreatedBy = "user-1",
            CreatedAt = DateTime.UtcNow, CategoryId = category.Id, IsPrivate = true
        };

        DbContext.Categories.Add(category);
        DbContext.Keywords.AddRange(publicKw, privateKw);
        DbContext.Items.AddRange(publicItem, privateItem);
        DbContext.ItemKeywords.AddRange(
            new ItemKeyword { Id = Guid.NewGuid(), ItemId = publicItem.Id, KeywordId = publicKw.Id },
            new ItemKeyword { Id = Guid.NewGuid(), ItemId = privateItem.Id, KeywordId = privateKw.Id });
        await DbContext.SaveChangesAsync();

        var result = await GetItemTagKeywords.HandleAsync("science", DbContext, UnauthenticatedUser().Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Names.Should().ContainSingle("biology");
        result.Value.Names.Should().NotContain("secret-kw");
    }

    [Fact]
    public async Task HandleAsync_Authenticated_ReturnsOwnPrivateKeywords()
    {
        string userId = Guid.NewGuid().ToString();
        Category category = new() { Id = Guid.NewGuid(), Name = "science", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword ownPrivateKw = new() { Id = Guid.NewGuid(), Name = "my-kw", IsPrivate = true, CreatedBy = userId, CreatedAt = DateTime.UtcNow };

        Item item = new()
        {
            Id = Guid.NewGuid(), Question = "Q?", CorrectAnswer = "A",
            IncorrectAnswers = new List<string> { "B" }, Explanation = "",
            FuzzySignature = "abc", FuzzyBucket = 1, CreatedBy = userId,
            CreatedAt = DateTime.UtcNow, CategoryId = category.Id, IsPrivate = true
        };

        DbContext.Categories.Add(category);
        DbContext.Keywords.Add(ownPrivateKw);
        DbContext.Items.Add(item);
        DbContext.ItemKeywords.Add(new ItemKeyword { Id = Guid.NewGuid(), ItemId = item.Id, KeywordId = ownPrivateKw.Id });
        await DbContext.SaveChangesAsync();

        var result = await GetItemTagKeywords.HandleAsync("science", DbContext, AuthenticatedUser(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Names.Should().Contain("my-kw");
    }

    [Fact]
    public async Task HandleAsync_ReturnsNamesAlphabeticallySorted()
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "science", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword zooKw = new() { Id = Guid.NewGuid(), Name = "zoology", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Keyword astroKw = new() { Id = Guid.NewGuid(), Name = "astronomy", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };

        Item item = new()
        {
            Id = Guid.NewGuid(), Question = "Q?", CorrectAnswer = "A",
            IncorrectAnswers = new List<string> { "B" }, Explanation = "",
            FuzzySignature = "abc", FuzzyBucket = 1, CreatedBy = "admin",
            CreatedAt = DateTime.UtcNow, CategoryId = category.Id, IsPrivate = false
        };

        DbContext.Categories.Add(category);
        DbContext.Keywords.AddRange(zooKw, astroKw);
        DbContext.Items.Add(item);
        DbContext.ItemKeywords.AddRange(
            new ItemKeyword { Id = Guid.NewGuid(), ItemId = item.Id, KeywordId = zooKw.Id },
            new ItemKeyword { Id = Guid.NewGuid(), ItemId = item.Id, KeywordId = astroKw.Id });
        await DbContext.SaveChangesAsync();

        var result = await GetItemTagKeywords.HandleAsync("science", DbContext, UnauthenticatedUser().Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Names.Should().BeInAscendingOrder(StringComparer.OrdinalIgnoreCase);
    }
}
