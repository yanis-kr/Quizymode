using FluentAssertions;
using Quizymode.Api.Features.Personalization;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.LearningLoop;

public sealed class InterestRefinementTests : DatabaseTestFixture
{
    [Theory]
    [InlineData("languages", "languages/french", false)]
    [InlineData("languages/french", "languages/french/core", false)]
    [InlineData("languages/french/core", "languages/french", false)]
    [InlineData("languages/french", "languages/german", true)]
    [InlineData("languages/french/core", "languages/french/travel", true)]
    [InlineData("languages/french/core/extra", "history", false)]
    [InlineData("languages//core", "history", false)]
    public void ValidatorRejectsOverlapsAndInvalidPaths(string first, string second, bool valid)
    {
        new Personalization.UpdateValidator().Validate(new Personalization.UpdateInterestsRequest([first, second])).IsValid.Should().Be(valid);
    }

    private async Task<(Category Category, Keyword French, Keyword German, KeywordRelation Core)> AddTopicsAsync()
    {
        Category category = await LearningLoopTestData.AddCategoryAsync(DbContext, "languages");
        Keyword french = new() { Id = Guid.NewGuid(), Name = "french", CreatedBy = "owner" };
        Keyword german = new() { Id = Guid.NewGuid(), Name = "german", CreatedBy = "owner" };
        Keyword core = new() { Id = Guid.NewGuid(), Name = "core", CreatedBy = "owner" };
        DbContext.Keywords.AddRange(french, german, core);
        KeywordRelation leaf = new() { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = french.Id, ChildKeywordId = core.Id };
        DbContext.KeywordRelations.AddRange(
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ChildKeywordId = french.Id },
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ChildKeywordId = german.Id }, leaf);
        await DbContext.SaveChangesAsync();
        return (category, french, german, leaf);
    }

    [Fact]
    public async Task SiblingRefinementsKeepOrderAndUnavailableLeafNeverWidens()
    {
        var topics = await AddTopicsAsync();
        var saved = await Personalization.ReplaceInterestsAsync(new(["languages/french/core", "languages/german"]), DbContext, "owner", default);
        saved.IsSuccess.Should().BeTrue();
        (await Personalization.GetInterestsAsync(DbContext, "owner", default)).Categories.Should().Equal("languages/french/core", "languages/german");
        topics.Core.IsPrivate = true;
        await DbContext.SaveChangesAsync();
        (await Personalization.GetInterestsAsync(DbContext, "owner", default)).Categories.Should().Equal("languages/german");
        (await Personalization.GetInterestsAsync(DbContext, "another-user", default)).Categories.Should().BeEmpty();
    }

    [Theory]
    [InlineData("languages/german/core")]
    [InlineData("languages/french/missing")]
    public async Task UnknownOrWrongParentLeavesDoNotReplaceSavedInterests(string invalid)
    {
        await AddTopicsAsync();
        await Personalization.ReplaceInterestsAsync(new(["languages/french"]), DbContext, "owner", default);
        var rejected = await Personalization.ReplaceInterestsAsync(new([invalid]), DbContext, "owner", default);
        rejected.IsFailure.Should().BeTrue();
        (await Personalization.GetInterestsAsync(DbContext, "owner", default)).Categories.Should().Equal("languages/french");
    }

    [Fact]
    public async Task PrivateOrRemovedRootDoesNotExposeItsChildren()
    {
        var topics = await AddTopicsAsync();
        await Personalization.ReplaceInterestsAsync(new(["languages/french/core"]), DbContext, "owner", default);
        topics.French.IsPrivate = true;
        await DbContext.SaveChangesAsync();
        (await Personalization.GetInterestsAsync(DbContext, "owner", default)).Categories.Should().BeEmpty();
    }
}
