using FluentAssertions;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Features.Items.GetById;
using Quizymode.Api.Features.Items.ReviewBoard;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items;

/// <summary>#359: GroupLabel is returned by every read path and normalised by the shared helper.</summary>
public sealed class GroupLabelReadTests : ItemTestFixture
{
    private async Task<Item> SeedAsync(string? label)
    {
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "Q?", "A", ["B"], "x", false, "test");
        item.GroupLabel = label;
        item.ReadyForReview = true;
        await DbContext.SaveChangesAsync();
        return item;
    }

    private static Mock<IUserContext> User()
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.IsAuthenticated).Returns(true);
        ctx.Setup(x => x.UserId).Returns("test");
        ctx.Setup(x => x.IsAdmin).Returns(false);
        return ctx;
    }

    [Fact]
    public async Task GetItemById_ReturnsGroupLabel()
    {
        Item item = await SeedAsync("Mammals");

        Result<GetItemById.Response> result = await GetItemById.HandleAsync(
            item.Id.ToString(), DbContext, User().Object, CancellationToken.None);

        result.Value.GroupLabel.Should().Be("Mammals");
    }

    [Fact]
    public async Task ReviewBoard_ReturnsGroupLabel()
    {
        await SeedAsync("Mammals");

        Result<GetReviewBoardItems.Response> result = await GetReviewBoardItems.HandleAsync(DbContext, CancellationToken.None);

        result.Value.Items.Should().ContainSingle().Which.GroupLabel.Should().Be("Mammals");
    }

    [Fact]
    public async Task ItemResponseMapper_ReturnsGroupLabelOrNull()
    {
        Item labelled = await SeedAsync("Mammals");
        Item plain = await SeedAsync(null);
        ItemResponseMapper mapper = new(User().Object);

        mapper.MapToResponse(labelled, []).GroupLabel.Should().Be("Mammals");
        mapper.MapToResponse(plain, []).GroupLabel.Should().BeNull();
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("   ", null)]
    [InlineData("  Mammals  ", "Mammals")]
    [InlineData("Big  cats", "Big  cats")]
    public void Normalize_TrimsAndMapsBlankToNull(string? input, string? expected) =>
        ItemGroupLabelHelper.Normalize(input).Should().Be(expected);

    [Fact]
    public void HasValidLength_MeasuresAfterTrim()
    {
        ItemGroupLabelHelper.HasValidLength(" " + new string('a', 30) + " ").Should().BeTrue();
        ItemGroupLabelHelper.HasValidLength(new string('a', 31)).Should().BeFalse();
    }

    [Theory]
    [InlineData("a\nb")]
    [InlineData("a\rb")]
    [InlineData("a\tb")]
    [InlineData("a\u0000b")]
    public void HasValidCharacters_RejectsLineBreaksControlAndFormatChars(string value) =>
        ItemGroupLabelHelper.HasValidCharacters(value).Should().BeFalse();

    [Theory]
    [InlineData(0x200B)]
    [InlineData(0x2028)]
    [InlineData(0x2029)]
    public void HasValidCharacters_RejectsFormatAndUnicodeSeparators(int codePoint) =>
        ItemGroupLabelHelper.HasValidCharacters($"a{(char)codePoint}b").Should().BeFalse();

    [Fact]
    public void HasValidCharacters_AcceptsOrdinaryText()
    {
        ItemGroupLabelHelper.HasValidCharacters("Big cats 2").Should().BeTrue();
        ItemGroupLabelHelper.HasValidCharacters("  padded\n").Should().BeTrue("surrounding whitespace is trimmed first");
        ItemGroupLabelHelper.HasValidCharacters(null).Should().BeTrue();
    }
}
