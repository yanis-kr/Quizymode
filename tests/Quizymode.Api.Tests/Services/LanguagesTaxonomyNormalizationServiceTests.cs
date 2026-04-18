using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class LanguagesTaxonomyNormalizationServiceTests : DatabaseTestFixture
{
    [Fact]
    public async Task NormalizeAsync_MigratesLegacyLanguageItems_AndRemovesLegacyRelations()
    {
        Category languagesCategory = await CreatePublicCategoryAsync("languages");
        Keyword english = await CreatePublicKeywordAsync("english");
        Keyword core = await CreatePublicKeywordAsync("core");
        Keyword otherLangs = await CreatePublicKeywordAsync("other-langs");
        Keyword mixed = await CreatePublicKeywordAsync("mixed");
        Keyword esl = await CreatePublicKeywordAsync("esl");
        Keyword beginner = await CreatePublicKeywordAsync("beginner");
        Keyword general = await CreatePublicKeywordAsync("general");

        await CreateRelationAsync(languagesCategory.Id, null, english.Id);
        await CreateRelationAsync(languagesCategory.Id, english.Id, core.Id);
        await CreateRelationAsync(languagesCategory.Id, null, otherLangs.Id);
        await CreateRelationAsync(languagesCategory.Id, otherLangs.Id, mixed.Id);
        await CreateRelationAsync(languagesCategory.Id, null, esl.Id);
        await CreateRelationAsync(languagesCategory.Id, esl.Id, beginner.Id);
        await CreateRelationAsync(languagesCategory.Id, null, general.Id);
        await CreateRelationAsync(languagesCategory.Id, general.Id, mixed.Id);

        Item eslItem = await CreateLanguageItemAsync(languagesCategory.Id, esl.Id, beginner.Id);
        Item generalItem = await CreateLanguageItemAsync(languagesCategory.Id, general.Id, mixed.Id);

        LanguagesTaxonomyNormalizationService service = new(
            DbContext,
            NullLogger<LanguagesTaxonomyNormalizationService>.Instance);

        await service.NormalizeAsync(CancellationToken.None);

        Item refreshedEslItem = await DbContext.Items
            .Include(item => item.NavigationKeyword1)
            .Include(item => item.NavigationKeyword2)
            .Include(item => item.ItemKeywords)
            .SingleAsync(item => item.Id == eslItem.Id);

        refreshedEslItem.NavigationKeyword1!.Name.Should().Be("english");
        refreshedEslItem.NavigationKeyword2!.Name.Should().Be("core");
        refreshedEslItem.ItemKeywords.Select(link => link.KeywordId).Should().Contain([english.Id, core.Id]);
        refreshedEslItem.ItemKeywords.Select(link => link.KeywordId).Should().NotContain([esl.Id, beginner.Id]);

        Item refreshedGeneralItem = await DbContext.Items
            .Include(item => item.NavigationKeyword1)
            .Include(item => item.NavigationKeyword2)
            .Include(item => item.ItemKeywords)
            .SingleAsync(item => item.Id == generalItem.Id);

        refreshedGeneralItem.NavigationKeyword1!.Name.Should().Be("other-langs");
        refreshedGeneralItem.NavigationKeyword2!.Name.Should().Be("mixed");
        refreshedGeneralItem.ItemKeywords.Select(link => link.KeywordId).Should().Contain([otherLangs.Id, mixed.Id]);
        refreshedGeneralItem.ItemKeywords.Select(link => link.KeywordId).Should().NotContain(general.Id);

        List<KeywordRelation> remainingRelations = await DbContext.KeywordRelations
            .Include(relation => relation.ParentKeyword)
            .Include(relation => relation.ChildKeyword)
            .Where(relation => relation.CategoryId == languagesCategory.Id)
            .ToListAsync();

        remainingRelations.Should().NotContain(relation => relation.ChildKeyword.Name == "esl");
        remainingRelations.Should().NotContain(relation => relation.ChildKeyword.Name == "general");
        remainingRelations.Should().Contain(relation =>
            relation.ParentKeywordId == null && relation.ChildKeyword.Name == "english");
        remainingRelations.Should().Contain(relation =>
            relation.ParentKeyword != null &&
            relation.ParentKeyword.Name == "english" &&
            relation.ChildKeyword.Name == "core");
        remainingRelations.Should().Contain(relation =>
            relation.ParentKeyword != null &&
            relation.ParentKeyword.Name == "other-langs" &&
            relation.ChildKeyword.Name == "mixed");
    }

    [Fact]
    public async Task NormalizeAsync_PromotesLegacyOtherLangsChildren_ToLanguageCore()
    {
        Category languagesCategory = await CreatePublicCategoryAsync("languages");
        Keyword otherLangs = await CreatePublicKeywordAsync("other-langs");
        Keyword japanese = await CreatePublicKeywordAsync("japanese");
        Keyword core = await CreatePublicKeywordAsync("core");

        await CreateRelationAsync(languagesCategory.Id, null, otherLangs.Id);
        await CreateRelationAsync(languagesCategory.Id, otherLangs.Id, japanese.Id);
        await CreateRelationAsync(languagesCategory.Id, null, japanese.Id);
        await CreateRelationAsync(languagesCategory.Id, japanese.Id, core.Id);

        Item item = await CreateLanguageItemAsync(languagesCategory.Id, otherLangs.Id, japanese.Id);

        LanguagesTaxonomyNormalizationService service = new(
            DbContext,
            NullLogger<LanguagesTaxonomyNormalizationService>.Instance);

        await service.NormalizeAsync(CancellationToken.None);

        Item refreshedItem = await DbContext.Items
            .Include(existing => existing.NavigationKeyword1)
            .Include(existing => existing.NavigationKeyword2)
            .Include(existing => existing.ItemKeywords)
            .SingleAsync(existing => existing.Id == item.Id);

        refreshedItem.NavigationKeyword1!.Name.Should().Be("japanese");
        refreshedItem.NavigationKeyword2!.Name.Should().Be("core");
        refreshedItem.ItemKeywords.Select(link => link.KeywordId).Should().Contain([japanese.Id, core.Id]);
        refreshedItem.ItemKeywords.Select(link => link.KeywordId).Should().NotContain(otherLangs.Id);

        DbContext.KeywordRelations.Should().NotContain(relation =>
            relation.CategoryId == languagesCategory.Id &&
            relation.ParentKeywordId == otherLangs.Id &&
            relation.ChildKeywordId == japanese.Id);
    }

    private async Task<Category> CreatePublicCategoryAsync(string name)
    {
        Category category = new()
        {
            Id = Guid.NewGuid(),
            Name = name,
            IsPrivate = false,
            CreatedBy = "seeder",
            CreatedAt = DateTime.UtcNow
        };

        DbContext.Categories.Add(category);
        await DbContext.SaveChangesAsync();
        return category;
    }

    private async Task<Keyword> CreatePublicKeywordAsync(string name)
    {
        Keyword keyword = new()
        {
            Id = Guid.NewGuid(),
            Name = name,
            Slug = name,
            IsPrivate = false,
            CreatedBy = "seeder",
            CreatedAt = DateTime.UtcNow,
            IsReviewPending = false
        };

        DbContext.Keywords.Add(keyword);
        await DbContext.SaveChangesAsync();
        return keyword;
    }

    private async Task CreateRelationAsync(Guid categoryId, Guid? parentKeywordId, Guid childKeywordId)
    {
        KeywordRelation relation = new()
        {
            Id = Guid.NewGuid(),
            CategoryId = categoryId,
            ParentKeywordId = parentKeywordId,
            ChildKeywordId = childKeywordId,
            SortOrder = 0,
            IsPrivate = false,
            CreatedAt = DateTime.UtcNow
        };

        DbContext.KeywordRelations.Add(relation);
        await DbContext.SaveChangesAsync();
    }

    private async Task<Item> CreateLanguageItemAsync(Guid categoryId, Guid navigationKeywordId1, Guid navigationKeywordId2)
    {
        Item item = new()
        {
            Id = Guid.NewGuid(),
            CategoryId = categoryId,
            NavigationKeywordId1 = navigationKeywordId1,
            NavigationKeywordId2 = navigationKeywordId2,
            Question = "Question",
            CorrectAnswer = "Answer",
            IncorrectAnswers = [],
            Explanation = "Explanation",
            FuzzySignature = "0000000000000000",
            FuzzyBucket = 0,
            CreatedBy = "seeder",
            CreatedAt = DateTime.UtcNow,
            IsPrivate = false
        };

        item.ItemKeywords =
        [
            new ItemKeyword
            {
                Id = Guid.NewGuid(),
                ItemId = item.Id,
                KeywordId = navigationKeywordId1,
                AddedAt = DateTime.UtcNow
            },
            new ItemKeyword
            {
                Id = Guid.NewGuid(),
                ItemId = item.Id,
                KeywordId = navigationKeywordId2,
                AddedAt = DateTime.UtcNow
            }
        ];

        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();
        return item;
    }
}
