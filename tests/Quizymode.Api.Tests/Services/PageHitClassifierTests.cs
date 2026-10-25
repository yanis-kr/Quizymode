using FluentAssertions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>
/// Table-driven classifier tests (ANALYTICS-004): one representative URL per route in App.tsx.
/// </summary>
public sealed class PageHitClassifierTests
{
    private const string ItemId = "3f2b1c4d-0000-4000-8000-000000000001";
    private const string CollectionId = "9a8b7c6d-0000-4000-8000-000000000002";

    public static TheoryData<string, string, string, string?, string?, string?, bool> Routes => new()
    {
        // path, query, area, scopeType, scopeKey, navPath, isItemStep
        { "/", "", "home", null, null, null, false },
        { "/categories", "", "browse", null, null, null, false },
        { "/categories/science", "", "browse", "category", "science", "science", false },
        { "/categories/geography/capitals", "", "browse", "category", "geography", "geography/capitals", false },
        { "/categories/geography/capitals/europe", "", "browse", "category", "geography", "geography/capitals/europe", false },
        { "/items", "", "browse", null, null, null, false },
        { $"/explore/item/{ItemId}", "", "flashcards", "item", ItemId, null, true },
        { $"/explore/geography/item/{ItemId}", "?nav=capitals", "flashcards", "category", "geography", "geography/capitals", true },
        { $"/explore/collections/{CollectionId}/my-deck/item/{ItemId}", "", "flashcards", "collection", CollectionId, null, true },
        { $"/explore/collections/{CollectionId}/item/{ItemId}", "", "flashcards", "collection", CollectionId, null, true },
        { $"/explore/collections/{CollectionId}/my-deck", "", "flashcards", "collection", CollectionId, null, false },
        { $"/explore/collections/{CollectionId}", "", "flashcards", "collection", CollectionId, null, false },
        { "/explore", "", "flashcards", null, null, null, false },
        { "/explore/science", "", "flashcards", "category", "science", "science", false },
        { $"/quiz/item/{ItemId}", "", "quiz", "item", ItemId, null, true },
        { $"/quiz/geography/item/{ItemId}", "?nav=capitals", "quiz", "category", "geography", "geography/capitals", true },
        { $"/quiz/collections/{CollectionId}/my-deck/item/{ItemId}", "", "quiz", "collection", CollectionId, null, true },
        { $"/quiz/collections/{CollectionId}/item/{ItemId}", "", "quiz", "collection", CollectionId, null, true },
        { $"/quiz/collections/{CollectionId}/my-deck", "", "quiz", "collection", CollectionId, null, false },
        { $"/quiz/collections/{CollectionId}", "", "quiz", "collection", CollectionId, null, false },
        { "/quiz", "", "quiz", null, null, null, false },
        { "/quiz/exams", "?nav=aws,saa-c03,extra", "quiz", "category", "exams", "exams/aws/saa-c03", false },
        { "/login", "", "auth", null, null, null, false },
        { "/signup", "", "auth", null, null, null, false },
        { "/create", "", "create", null, null, null, false },
        { "/create/notes", "", "create", null, null, null, false },
        { "/create/question", "", "create", null, null, null, false },
        { "/create/import", "", "create", null, null, null, false },
        { "/items/add", "", "create", null, null, null, false },
        { "/items/bulk-create", "", "create", null, null, null, false },
        { "/items/upload", "", "create", null, null, null, false },
        { "/add-new-item", "", "create", null, null, null, false },
        { "/items/create", "", "create", null, null, null, false },
        { $"/items/{ItemId}/edit", "", "create", "item", ItemId, null, false },
        { "/study-guide", "", "study-guide", null, null, null, false },
        { "/study-guide/import", "", "study-guide", null, null, null, false },
        { "/search", "?q=photosynthesis", "search", null, null, null, false },
        { "/search/", "", "search", null, null, null, false },
        { "/search/anything", "", "other", null, null, null, false },
        { $"/items/{ItemId}/comments", "", "item-detail", "item", ItemId, null, false },
        { $"/items/{ItemId}", "", "item-detail", "item", ItemId, null, false },
        { "/featured", "", "featured", null, null, null, false },
        { "/collections", "", "collections", null, null, null, false },
        { $"/collections/{CollectionId}/my-deck", "", "collections", "collection", CollectionId, null, false },
        { $"/collections/{CollectionId}", "", "collections", "collection", CollectionId, null, false },
        { "/admin", "", "admin", null, null, null, false },
        { "/admin/page-views", "", "admin", null, null, null, false },
        { "/about", "", "info", null, null, null, false },
        { "/ideas", "", "community", null, null, null, false },
        { "/roadmap", "", "community", null, null, null, false },
        { "/feedback", "", "community", null, null, null, false },
        { "/privacy", "", "info", null, null, null, false },
        { "/privacy-policy", "", "info", null, null, null, false },
        { "/terms", "", "info", null, null, null, false },
        { "/terms-of-service", "", "info", null, null, null, false },
        { "/promo", "", "other", null, null, null, false },
        { "/items/abc/unknown/deeper", "", "other", null, null, null, false },
    };

    [Theory]
    [MemberData(nameof(Routes))]
    public void Classify_MapsEveryAppRoute(
        string path,
        string query,
        string area,
        string? scopeType,
        string? scopeKey,
        string? navPath,
        bool isItemStep)
    {
        PageHitClassifier.Classification result = PageHitClassifier.Classify(path, query);

        result.Area.Should().Be(area);
        result.ScopeType.Should().Be(scopeType);
        result.ScopeKey.Should().Be(scopeKey);
        result.NavPath.Should().Be(navPath);
        result.IsItemStep.Should().Be(isItemStep);
    }

    [Fact]
    public void Classify_IssueExample_QuizCategoryWithNav()
    {
        PageHitClassifier.Classification result =
            PageHitClassifier.Classify($"/quiz/geography/item/{ItemId}", "?nav=capitals");

        result.Should().Be(new PageHitClassifier.Classification("quiz", "category", "geography", "geography/capitals", true));
    }

    [Fact]
    public void Classify_TrailingSlashAndCaseAreNormalized()
    {
        PageHitClassifier.Classify("/Quiz/Geography/", null).ScopeKey.Should().Be("geography");
        PageHitClassifier.Classify("/items/add/", null).Area.Should().Be("create");
    }

    [Fact]
    public void Classify_ScopeKeyIsCappedAt200Characters()
    {
        string longSlug = new('a', 500);

        PageHitClassifier.Classification result = PageHitClassifier.Classify($"/quiz/{longSlug}", null);

        result.ScopeKey!.Length.Should().Be(PageHitClassifier.ScopeKeyMaxLength);
        result.NavPath!.Length.Should().BeLessThanOrEqualTo(PageHitClassifier.NavPathMaxLength);
    }

    [Fact]
    public void Classify_AreaAlwaysInKnownList()
    {
        foreach (object?[] row in Routes)
        {
            PageHitClassifier.AllAreas.Should().Contain(PageHitClassifier.Classify((string)row[0]!, (string)row[1]!).Area);
        }
    }
}
