using FluentAssertions;
using Quizymode.Api.Features.Taxonomy;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Taxonomy;

public sealed class GetTaxonomyTests : ItemTestFixture
{
    [Fact]
    public async Task BuildResponseAsync_UsesParentAwareKeywordCounts()
    {
        await SeedTriviaPathDataAsync();

        GetTaxonomy.Response response = await GetTaxonomy.BuildResponseAsync(
            TaxonomyRegistry,
            DbContext,
            CreateUserContextMock("reader").Object,
            CancellationToken.None);

        GetTaxonomy.CategoryDto trivia = response.Categories.Single(category => category.Slug == "trivia");
        GetTaxonomy.L1Dto generalGroup = trivia.Groups.Single(group => group.Slug == "general");
        GetTaxonomy.L1Dto famousPeopleGroup = trivia.Groups.Single(group => group.Slug == "famous-people");

        generalGroup.ItemCount.Should().Be(5);
        generalGroup.Keywords.Single(keyword => keyword.Slug == "mixed").ItemCount.Should().Be(5);
        generalGroup.Keywords.Single(keyword => keyword.Slug == "random").ItemCount.Should().Be(0);
        generalGroup.Keywords.Single(keyword => keyword.Slug == "easy").ItemCount.Should().Be(0);
        generalGroup.Keywords.Single(keyword => keyword.Slug == "hard").ItemCount.Should().Be(0);

        famousPeopleGroup.ItemCount.Should().Be(1);
        famousPeopleGroup.Keywords.Single(keyword => keyword.Slug == "mixed").ItemCount.Should().Be(1);
    }

    private async Task SeedTriviaPathDataAsync()
    {
        const string createdBy = "seeder";

        Category category = new()
        {
            Id = Guid.NewGuid(),
            Name = "trivia",
            IsPrivate = false,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow
        };

        Keyword general = CreateKeyword("general", createdBy);
        Keyword mixed = CreateKeyword("mixed", createdBy);
        Keyword famousPeople = CreateKeyword("famous-people", createdBy);

        DbContext.AddRange(category, general, mixed, famousPeople);
        DbContext.AddRange(
            CreateRelation(category.Id, null, general.Id, 0),
            CreateRelation(category.Id, general.Id, general.Id, 0),
            CreateRelation(category.Id, general.Id, mixed.Id, 1),
            CreateRelation(category.Id, null, famousPeople.Id, 2),
            CreateRelation(category.Id, famousPeople.Id, mixed.Id, 0));

        for (int index = 0; index < 5; index++)
        {
            DbContext.Items.Add(CreateItem(
                category.Id,
                general.Id,
                mixed.Id,
                $"general mixed question {index}",
                createdBy));
        }

        DbContext.Items.Add(CreateItem(
            category.Id,
            famousPeople.Id,
            mixed.Id,
            "famous people mixed question",
            createdBy));

        await DbContext.SaveChangesAsync();
    }

    private Item CreateItem(
        Guid categoryId,
        Guid nav1Id,
        Guid nav2Id,
        string question,
        string createdBy)
    {
        string normalizedQuestion = question.Trim().ToLowerInvariant();
        string simHash = SimHashService.ComputeSimHash(normalizedQuestion);

        return new Item
        {
            Id = Guid.NewGuid(),
            CategoryId = categoryId,
            NavigationKeywordId1 = nav1Id,
            NavigationKeywordId2 = nav2Id,
            Question = question,
            CorrectAnswer = "answer",
            IncorrectAnswers = ["a", "b", "c"],
            Explanation = "explanation",
            FuzzySignature = simHash,
            FuzzyBucket = SimHashService.GetFuzzyBucket(simHash),
            IsPrivate = false,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow
        };
    }

    private static Keyword CreateKeyword(string name, string createdBy)
    {
        return new Keyword
        {
            Id = Guid.NewGuid(),
            Name = name,
            Slug = name,
            IsPrivate = false,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow
        };
    }

    private static KeywordRelation CreateRelation(
        Guid categoryId,
        Guid? parentKeywordId,
        Guid childKeywordId,
        int sortOrder)
    {
        return new KeywordRelation
        {
            Id = Guid.NewGuid(),
            CategoryId = categoryId,
            ParentKeywordId = parentKeywordId,
            ChildKeywordId = childKeywordId,
            SortOrder = sortOrder,
            CreatedAt = DateTime.UtcNow,
            IsPrivate = false
        };
    }
}
