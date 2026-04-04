using FluentAssertions;
using Moq;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class ItemNavigationAndKeywordsHelperTests : DatabaseTestFixture
{
    private static Category CreateCategory(string name = "Geography")
    {
        return new Category
        {
            Id = Guid.NewGuid(),
            Name = name,
            CreatedBy = "seed",
            CreatedAt = DateTime.UtcNow
        };
    }

    private static Keyword CreateKeyword(string name, bool isPrivate = false, string createdBy = "seed")
    {
        return new Keyword
        {
            Id = Guid.NewGuid(),
            Name = name,
            Slug = name,
            IsPrivate = isPrivate,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            IsReviewPending = isPrivate
        };
    }

    private async Task SeedNavigationAsync(
        Category category,
        Keyword primary,
        Keyword secondary,
        bool isPrivate = false)
    {
        DbContext.Categories.Add(category);
        DbContext.Keywords.AddRange(primary, secondary);
        DbContext.KeywordRelations.AddRange(
            new KeywordRelation
            {
                Id = Guid.NewGuid(),
                CategoryId = category.Id,
                Category = category,
                ChildKeywordId = primary.Id,
                ChildKeyword = primary,
                ParentKeywordId = null,
                IsPrivate = isPrivate,
                CreatedAt = DateTime.UtcNow
            },
            new KeywordRelation
            {
                Id = Guid.NewGuid(),
                CategoryId = category.Id,
                Category = category,
                ParentKeywordId = primary.Id,
                ParentKeyword = primary,
                ChildKeywordId = secondary.Id,
                ChildKeyword = secondary,
                IsPrivate = isPrivate,
                CreatedAt = DateTime.UtcNow
            });

        await DbContext.SaveChangesAsync();
    }

    [Fact]
    public async Task ResolvePublicNavigationAsync_Fails_WhenKeywordsAreMissing()
    {
        Mock<ITaxonomyRegistry> taxonomy = new();
        Category category = CreateCategory();

        var result = await ItemNavigationAndKeywordsHelper.ResolvePublicNavigationAsync(
            DbContext,
            taxonomy.Object,
            category,
            "",
            "topics",
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Item.InvalidNavigation");
    }

    [Fact]
    public async Task ResolvePublicNavigationAsync_Fails_WhenTaxonomyRejectsPath()
    {
        Mock<ITaxonomyRegistry> taxonomy = new();
        taxonomy.Setup(x => x.IsValidNavigationPath("Geography", "history", "ancient"))
            .Returns(false);

        var result = await ItemNavigationAndKeywordsHelper.ResolvePublicNavigationAsync(
            DbContext,
            taxonomy.Object,
            CreateCategory(),
            "history",
            "ancient",
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Item.InvalidNavigationPath");
    }

    [Fact]
    public async Task ResolvePublicNavigationAsync_Fails_WhenPrimaryKeywordDoesNotExist()
    {
        Mock<ITaxonomyRegistry> taxonomy = new();
        taxonomy.Setup(x => x.IsValidNavigationPath(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()))
            .Returns(true);

        var result = await ItemNavigationAndKeywordsHelper.ResolvePublicNavigationAsync(
            DbContext,
            taxonomy.Object,
            CreateCategory(),
            "History",
            "Ancient",
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Item.InvalidNavigationKeyword1");
    }

    [Fact]
    public async Task ResolvePublicNavigationAsync_ReturnsKeywords_WhenBothRelationsExist()
    {
        Mock<ITaxonomyRegistry> taxonomy = new();
        taxonomy.Setup(x => x.IsValidNavigationPath(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()))
            .Returns(true);

        Category category = CreateCategory();
        Keyword primary = CreateKeyword("history");
        Keyword secondary = CreateKeyword("ancient");
        await SeedNavigationAsync(category, primary, secondary);

        var result = await ItemNavigationAndKeywordsHelper.ResolvePublicNavigationAsync(
            DbContext,
            taxonomy.Object,
            category,
            "history",
            "ancient",
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Nav1.Id.Should().Be(primary.Id);
        result.Value.Nav2.Id.Should().Be(secondary.Id);
    }

    [Fact]
    public async Task GetOrCreateKeywordForItemAttachmentAsync_ReturnsExistingPublicKeyword()
    {
        Mock<ITaxonomyRegistry> taxonomy = new();
        taxonomy.Setup(x => x.IsTaxonomyKeywordInCategory("Geography", "history"))
            .Returns(true);

        Keyword existing = CreateKeyword("history");
        DbContext.Keywords.Add(existing);
        await DbContext.SaveChangesAsync();

        Keyword result = await ItemNavigationAndKeywordsHelper.GetOrCreateKeywordForItemAttachmentAsync(
            DbContext,
            taxonomy.Object,
            "Geography",
            "user-1",
            "history",
            CancellationToken.None);

        result.Id.Should().Be(existing.Id);
        DbContext.Keywords.Should().ContainSingle();
    }

    [Fact]
    public async Task GetOrCreateKeywordForItemAttachmentAsync_CreatesGlobalKeyword_ForTaxonomyKeyword()
    {
        Mock<ITaxonomyRegistry> taxonomy = new();
        taxonomy.Setup(x => x.IsTaxonomyKeywordInCategory("Geography", "world history"))
            .Returns(true);

        Keyword result = await ItemNavigationAndKeywordsHelper.GetOrCreateKeywordForItemAttachmentAsync(
            DbContext,
            taxonomy.Object,
            "Geography",
            "user-1",
            "world history",
            CancellationToken.None);

        result.IsPrivate.Should().BeFalse();
        result.IsReviewPending.Should().BeFalse();
        result.CreatedBy.Should().Be("user-1");
        result.Slug.Should().Be("world-history");
        DbContext.Keywords.Should().ContainSingle(k => k.Id == result.Id);
    }

    [Fact]
    public async Task GetOrCreateKeywordForItemAttachmentAsync_ReturnsExistingPrivateKeyword_ForUser()
    {
        Mock<ITaxonomyRegistry> taxonomy = new();
        taxonomy.Setup(x => x.IsTaxonomyKeywordInCategory("Geography", "my topic"))
            .Returns(false);

        Keyword existing = CreateKeyword("my topic", isPrivate: true, createdBy: "user-1");
        DbContext.Keywords.Add(existing);
        await DbContext.SaveChangesAsync();

        Keyword result = await ItemNavigationAndKeywordsHelper.GetOrCreateKeywordForItemAttachmentAsync(
            DbContext,
            taxonomy.Object,
            "Geography",
            "user-1",
            "my topic",
            CancellationToken.None);

        result.Id.Should().Be(existing.Id);
        DbContext.Keywords.Should().ContainSingle();
    }

    [Fact]
    public async Task GetOrCreateKeywordForItemAttachmentAsync_CreatesPrivatePendingKeyword_ForCustomKeyword()
    {
        Mock<ITaxonomyRegistry> taxonomy = new();
        taxonomy.Setup(x => x.IsTaxonomyKeywordInCategory("Geography", "my topic"))
            .Returns(false);

        Keyword result = await ItemNavigationAndKeywordsHelper.GetOrCreateKeywordForItemAttachmentAsync(
            DbContext,
            taxonomy.Object,
            "Geography",
            "user-1",
            "my topic",
            CancellationToken.None);

        result.IsPrivate.Should().BeTrue();
        result.IsReviewPending.Should().BeTrue();
        result.CreatedBy.Should().Be("user-1");
        result.Slug.Should().Be("my-topic");
        DbContext.Keywords.Should().ContainSingle(k => k.Id == result.Id);
    }
}
