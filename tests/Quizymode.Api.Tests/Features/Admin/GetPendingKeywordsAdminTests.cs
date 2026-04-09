using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class GetPendingKeywordsAdminTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_NoPendingKeywords_ReturnsEmpty()
    {
        var result = await GetPendingKeywordsAdmin.HandleAsync(DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_OnlyPrivateAndPending_ReturnsKeywords()
    {
        Keyword publicKw = new() { Id = Guid.NewGuid(), Name = "public-kw", IsPrivate = false, IsReviewPending = false, CreatedBy = "user1", CreatedAt = DateTime.UtcNow };
        Keyword privateNotPending = new() { Id = Guid.NewGuid(), Name = "private-approved", IsPrivate = true, IsReviewPending = false, CreatedBy = "user1", CreatedAt = DateTime.UtcNow };
        Keyword privateAndPending = new() { Id = Guid.NewGuid(), Name = "pending-review", IsPrivate = true, IsReviewPending = true, CreatedBy = "user2", CreatedAt = DateTime.UtcNow };
        DbContext.Keywords.AddRange(publicKw, privateNotPending, privateAndPending);

        Category category = new() { Id = Guid.NewGuid(), Name = "cat", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        Item item = new()
        {
            Id = Guid.NewGuid(), Question = "Q?", CorrectAnswer = "A",
            IncorrectAnswers = new List<string> { "B" }, Explanation = "",
            FuzzySignature = "sig", FuzzyBucket = 1, CreatedBy = "user2",
            CreatedAt = DateTime.UtcNow, CategoryId = category.Id
        };
        DbContext.Items.Add(item);
        DbContext.ItemKeywords.Add(new ItemKeyword { Id = Guid.NewGuid(), ItemId = item.Id, KeywordId = privateAndPending.Id });

        await DbContext.SaveChangesAsync();

        var result = await GetPendingKeywordsAdmin.HandleAsync(DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().ContainSingle(k => k.Name == "pending-review");
    }

    [Fact]
    public async Task HandleAsync_IncludesUsageCount()
    {
        Keyword pendingKw = new() { Id = Guid.NewGuid(), Name = "test-kw", IsPrivate = true, IsReviewPending = true, CreatedBy = "user", CreatedAt = DateTime.UtcNow };
        DbContext.Keywords.Add(pendingKw);

        Category category = new() { Id = Guid.NewGuid(), Name = "cat", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);

        Item item = new()
        {
            Id = Guid.NewGuid(), Question = "Q?", CorrectAnswer = "A",
            IncorrectAnswers = new List<string> { "B" }, Explanation = "",
            FuzzySignature = "sig", FuzzyBucket = 1, CreatedBy = "user",
            CreatedAt = DateTime.UtcNow, CategoryId = category.Id
        };
        DbContext.Items.Add(item);
        DbContext.ItemKeywords.Add(new ItemKeyword { Id = Guid.NewGuid(), ItemId = item.Id, KeywordId = pendingKw.Id });
        await DbContext.SaveChangesAsync();

        var result = await GetPendingKeywordsAdmin.HandleAsync(DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Single(k => k.Name == "test-kw").UsageCount.Should().Be(1);
    }

    [Fact]
    public async Task HandleAsync_ExcludesPendingKeywordsWithNoUsage()
    {
        Keyword unusedPending = new()
        {
            Id = Guid.NewGuid(),
            Name = "unused-kw",
            IsPrivate = true,
            IsReviewPending = true,
            CreatedBy = "user",
            CreatedAt = DateTime.UtcNow
        };

        DbContext.Keywords.Add(unusedPending);
        await DbContext.SaveChangesAsync();

        var result = await GetPendingKeywordsAdmin.HandleAsync(DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Keywords.Should().BeEmpty();
    }
}
