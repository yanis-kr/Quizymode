using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class ReviewKeywordAdminTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AdminUser(string userId = "admin-1")
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.UserId).Returns(userId);
        ctx.Setup(x => x.IsAdmin).Returns(true);
        return ctx;
    }

    private async Task<Keyword> CreatePendingKeywordAsync(string name = "my-keyword")
    {
        Keyword keyword = new()
        {
            Id = Guid.NewGuid(),
            Name = name,
            IsPrivate = true,
            IsReviewPending = true,
            CreatedBy = "user-1",
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Keywords.Add(keyword);
        await DbContext.SaveChangesAsync();
        return keyword;
    }

    // --- ApproveAsync ---

    [Fact]
    public async Task ApproveAsync_KeywordNotFound_ReturnsNotFound()
    {
        var result = await ReviewKeywordAdmin.ApproveAsync(Guid.NewGuid(), DbContext, AdminUser().Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.KeywordNotFound");
    }

    [Fact]
    public async Task ApproveAsync_ExistingKeyword_MakesPublicAndClearsReviewPending()
    {
        Keyword keyword = await CreatePendingKeywordAsync();

        var result = await ReviewKeywordAdmin.ApproveAsync(keyword.Id, DbContext, AdminUser("admin-2").Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.IsPrivate.Should().BeFalse();
        result.Value.IsReviewPending.Should().BeFalse();
        result.Value.ReviewedBy.Should().Be("admin-2");
        result.Value.ReviewedAt.Should().NotBeNull();

        Keyword? stored = await DbContext.Keywords.FindAsync(keyword.Id);
        stored!.IsPrivate.Should().BeFalse();
        stored.IsReviewPending.Should().BeFalse();
    }

    [Fact]
    public async Task ApproveAsync_WhenMatchingPublicKeywordExists_MergesLinksAndDeletesPendingKeyword()
    {
        Category category = new()
        {
            Id = Guid.NewGuid(),
            Name = "science",
            IsPrivate = false,
            CreatedBy = "admin",
            CreatedAt = DateTime.UtcNow
        };

        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = "Q?",
            CorrectAnswer = "A",
            IncorrectAnswers = ["B"],
            Explanation = string.Empty,
            FuzzySignature = "sig",
            FuzzyBucket = 1,
            CreatedBy = "user-1",
            CreatedAt = DateTime.UtcNow,
            CategoryId = category.Id
        };

        Keyword publicKeyword = new()
        {
            Id = Guid.NewGuid(),
            Name = "my-keyword",
            IsPrivate = false,
            IsReviewPending = false,
            CreatedBy = "seeder",
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };

        Keyword pendingKeyword = new()
        {
            Id = Guid.NewGuid(),
            Name = "my-keyword",
            IsPrivate = true,
            IsReviewPending = true,
            CreatedBy = "seeder",
            CreatedAt = DateTime.UtcNow
        };

        DbContext.Categories.Add(category);
        DbContext.Items.Add(item);
        DbContext.Keywords.AddRange(publicKeyword, pendingKeyword);
        DbContext.ItemKeywords.Add(new ItemKeyword
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            KeywordId = pendingKeyword.Id,
            AddedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        var result = await ReviewKeywordAdmin.ApproveAsync(
            pendingKeyword.Id,
            DbContext,
            AdminUser("admin-merge").Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Id.Should().Be(publicKeyword.Id);
        result.Value.IsPrivate.Should().BeFalse();
        result.Value.IsReviewPending.Should().BeFalse();
        result.Value.ReviewedBy.Should().Be("admin-merge");

        Keyword? deletedPendingKeyword = await DbContext.Keywords.FindAsync(pendingKeyword.Id);
        deletedPendingKeyword.Should().BeNull();

        Keyword? storedPublicKeyword = await DbContext.Keywords.FindAsync(publicKeyword.Id);
        storedPublicKeyword.Should().NotBeNull();
        storedPublicKeyword!.ReviewedBy.Should().Be("admin-merge");

        List<ItemKeyword> links = DbContext.ItemKeywords
            .Where(link => link.ItemId == item.Id)
            .ToList();
        links.Should().ContainSingle();
        links[0].KeywordId.Should().Be(publicKeyword.Id);
    }

    // --- RejectAsync ---

    [Fact]
    public async Task RejectAsync_KeywordNotFound_ReturnsNotFound()
    {
        var result = await ReviewKeywordAdmin.RejectAsync(Guid.NewGuid(), DbContext, AdminUser().Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.KeywordNotFound");
    }

    [Fact]
    public async Task RejectAsync_ExistingKeyword_KeepsPrivateButClearsReviewPending()
    {
        Keyword keyword = await CreatePendingKeywordAsync();

        var result = await ReviewKeywordAdmin.RejectAsync(keyword.Id, DbContext, AdminUser("admin-3").Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.IsPrivate.Should().BeTrue();   // stays private
        result.Value.IsReviewPending.Should().BeFalse();
        result.Value.ReviewedBy.Should().Be("admin-3");

        Keyword? stored = await DbContext.Keywords.FindAsync(keyword.Id);
        stored!.IsPrivate.Should().BeTrue();
        stored.IsReviewPending.Should().BeFalse();
    }
}
