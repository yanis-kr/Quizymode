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
