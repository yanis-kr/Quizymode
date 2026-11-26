using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.Get;

/// <summary>AC 4.1.8: the item list and export queries never run unfiltered for a caller without a user id.</summary>
public sealed class ItemQueryBuilderMissingUserIdTests : DatabaseTestFixture
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public async Task AC_4_1_8_AuthenticatedWithoutUserId_SeesOnlyPublicItems(string? userId)
    {
        Category category = new() { Id = Guid.NewGuid(), Name = "science", CreatedBy = "owner", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(category);
        Item visible = NewItem(category, isPrivate: false, "public question");
        Item hidden = NewItem(category, isPrivate: true, "private question");
        Item pending = NewItem(category, isPrivate: false, "picture awaiting review");
        pending.ImageReviewState = ItemImageReviewState.PendingReview;
        DbContext.Items.AddRange(visible, hidden, pending);
        await DbContext.SaveChangesAsync();

        Mock<IUserContext> user = new();
        user.SetupGet(x => x.IsAuthenticated).Returns(true);
        user.SetupGet(x => x.UserId).Returns(userId);

        foreach (string? categoryName in new[] { null, "science" })
        {
            ItemQueryBuilder builder = new(DbContext, user.Object, CancellationToken.None);

            var result = await builder.BuildQueryAsync(
                new GetItems.QueryRequest(categoryName, null, null, null, null, 1, 100));

            result.IsSuccess.Should().BeTrue();
            result.Value!.Select(i => i.Id).ToList().Should().Equal(visible.Id);
        }
    }

    private static Item NewItem(Category category, bool isPrivate, string question) => new()
    {
        Id = Guid.NewGuid(),
        IsPrivate = isPrivate,
        Question = question,
        CorrectAnswer = "a",
        IncorrectAnswers = ["b"],
        Explanation = string.Empty,
        FuzzySignature = "A",
        FuzzyBucket = 1,
        CreatedBy = "owner",
        CreatedAt = DateTime.UtcNow,
        CategoryId = category.Id
    };
}
