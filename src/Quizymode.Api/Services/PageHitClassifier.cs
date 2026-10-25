using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Primitives;

namespace Quizymode.Api.Services;

/// <summary>
/// Classifies an SPA page hit by feature area and content scope (ANALYTICS-004) so reports can group
/// usage by what the visitor was doing instead of by raw URL. Runs at write time in
/// <c>TrackPageView</c> and in <see cref="PageViewClassificationBackfill"/>, so new and historical
/// rows are classified identically. Specific routes are matched before parameterised ones (so
/// <c>/items/add</c> is <c>create</c>, not an item detail page); unknown paths map to <c>other</c>.
/// </summary>
public static class PageHitClassifier
{
    public const string AreaHome = "home";
    public const string AreaBrowse = "browse";
    public const string AreaQuiz = "quiz";
    public const string AreaFlashcards = "flashcards";
    public const string AreaCollections = "collections";
    public const string AreaFeatured = "featured";
    public const string AreaItemDetail = "item-detail";
    public const string AreaCreate = "create";
    public const string AreaStudyGuide = "study-guide";
    public const string AreaAuth = "auth";
    public const string AreaCommunity = "community";
    public const string AreaInfo = "info";
    public const string AreaAdmin = "admin";
    public const string AreaSearch = "search";
    public const string AreaOther = "other";

    public const string ScopeCategory = "category";
    public const string ScopeCollection = "collection";
    public const string ScopeItem = "item";

    public const int ScopeKeyMaxLength = 200;
    public const int NavPathMaxLength = 400;

    /// <summary>Every area the classifier can produce, in display order.</summary>
    public static readonly IReadOnlyList<string> AllAreas =
    [
        AreaHome, AreaBrowse, AreaQuiz, AreaFlashcards, AreaCollections, AreaFeatured, AreaItemDetail,
        AreaCreate, AreaStudyGuide, AreaSearch, AreaAuth, AreaCommunity, AreaInfo, AreaAdmin, AreaOther
    ];

    private static readonly HashSet<string> CreateItemSubpaths =
        new(StringComparer.Ordinal) { "add", "bulk-create", "upload", "create" };

    /// <param name="Area">Feature area; never null.</param>
    /// <param name="ScopeType"><c>category</c>, <c>collection</c>, <c>item</c>, or null.</param>
    /// <param name="ScopeKey">Category slug, collection id, or item id (lower-cased, at most 200 chars).</param>
    /// <param name="NavPath">Category plus up to two navigation keywords (e.g. <c>geography/capitals</c>); category scope only.</param>
    /// <param name="IsItemStep">True when a Quiz or Flashcards path contains <c>/item/&lt;id&gt;</c>.</param>
    public sealed record Classification(
        string Area,
        string? ScopeType,
        string? ScopeKey,
        string? NavPath,
        bool IsItemStep);

    public static Classification Classify(string? path, string? queryString)
    {
        string[] segments = SplitPath(path);

        if (segments.Length == 0)
        {
            return Unscoped(AreaHome);
        }

        string head = segments[0];
        switch (head)
        {
            case "categories":
                return ClassifyCategories(segments, queryString);
            case "items":
                return ClassifyItems(segments);
            case "add-new-item":
            case "create":
                return Unscoped(AreaCreate);
            case "quiz":
                return ClassifyStudyMode(AreaQuiz, segments, queryString);
            case "explore":
                return ClassifyStudyMode(AreaFlashcards, segments, queryString);
            case "collections":
                return segments.Length >= 2
                    ? Scoped(AreaCollections, ScopeCollection, segments[1])
                    : Unscoped(AreaCollections);
            case "featured":
                return Unscoped(AreaFeatured);
            case "study-guide":
                return Unscoped(AreaStudyGuide);
            case "search":
                return segments.Length == 1 ? Unscoped(AreaSearch) : Unscoped(AreaOther);
            case "login":
            case "signup":
                return segments.Length == 1 ? Unscoped(AreaAuth) : Unscoped(AreaOther);
            case "ideas":
            case "roadmap":
            case "feedback":
                return segments.Length == 1 ? Unscoped(AreaCommunity) : Unscoped(AreaOther);
            case "about":
                return segments.Length == 1 ? Unscoped(AreaInfo) : Unscoped(AreaOther);
            case "admin":
                return Unscoped(AreaAdmin);
        }

        if (head.StartsWith("privacy", StringComparison.Ordinal) || head.StartsWith("terms", StringComparison.Ordinal))
        {
            return Unscoped(AreaInfo);
        }

        return Unscoped(AreaOther);
    }

    private static Classification ClassifyCategories(string[] segments, string? queryString)
    {
        if (segments.Length == 1)
        {
            return Unscoped(AreaBrowse);
        }

        string category = segments[1];
        IEnumerable<string> keywords = segments.Length > 2
            ? segments.Skip(2)
            : ParseNavKeywords(queryString);

        return new Classification(
            AreaBrowse,
            ScopeCategory,
            Truncate(category, ScopeKeyMaxLength),
            BuildNavPath(category, keywords),
            IsItemStep: false);
    }

    private static Classification ClassifyItems(string[] segments)
    {
        if (segments.Length == 1)
        {
            return Unscoped(AreaBrowse);
        }

        // Specific create routes win over the parameterised /items/:id detail route.
        if (segments.Length == 2 && CreateItemSubpaths.Contains(segments[1]))
        {
            return Unscoped(AreaCreate);
        }

        string itemId = segments[1];
        if (segments.Length == 2)
        {
            return Scoped(AreaItemDetail, ScopeItem, itemId);
        }

        if (segments.Length == 3 && segments[2] == "comments")
        {
            return Scoped(AreaItemDetail, ScopeItem, itemId);
        }

        if (segments.Length == 3 && segments[2] == "edit")
        {
            return Scoped(AreaCreate, ScopeItem, itemId);
        }

        return Unscoped(AreaOther);
    }

    /// <summary>
    /// Quiz (<c>/quiz</c>) and Flashcards (<c>/explore</c>) share one route shape:
    /// <c>/:mode</c>, <c>/:mode/:category</c>, <c>/:mode/item/:id</c>, <c>/:mode/:category/item/:id</c>,
    /// <c>/:mode/collections/:id[/:slug][/item/:id]</c>.
    /// </summary>
    private static Classification ClassifyStudyMode(string area, string[] segments, string? queryString)
    {
        string[] rest = segments[1..];
        bool isItemStep = HasItemStep(rest);

        if (rest.Length == 0)
        {
            return Unscoped(area);
        }

        if (rest[0] == "item")
        {
            return rest.Length >= 2
                ? new Classification(area, ScopeItem, Truncate(rest[1], ScopeKeyMaxLength), null, isItemStep)
                : Unscoped(area);
        }

        if (rest[0] == "collections")
        {
            return rest.Length >= 2
                ? new Classification(area, ScopeCollection, Truncate(rest[1], ScopeKeyMaxLength), null, isItemStep)
                : Unscoped(area);
        }

        string category = rest[0];
        return new Classification(
            area,
            ScopeCategory,
            Truncate(category, ScopeKeyMaxLength),
            BuildNavPath(category, ParseNavKeywords(queryString)),
            isItemStep);
    }

    private static bool HasItemStep(string[] rest)
    {
        for (int index = 0; index < rest.Length - 1; index++)
        {
            if (rest[index] == "item" && rest[index + 1].Length > 0)
            {
                return true;
            }
        }

        return false;
    }

    private static IEnumerable<string> ParseNavKeywords(string? queryString)
    {
        if (string.IsNullOrWhiteSpace(queryString))
        {
            return [];
        }

        Dictionary<string, StringValues> parsed = QueryHelpers.ParseQuery(queryString);
        if (!parsed.TryGetValue("nav", out StringValues value))
        {
            return [];
        }

        return value.ToString()
            .Split([',', '/'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(keyword => keyword.ToLowerInvariant());
    }

    private static string BuildNavPath(string category, IEnumerable<string> keywords)
    {
        List<string> parts = [category];
        parts.AddRange(keywords.Where(keyword => keyword.Length > 0).Take(2));
        return Truncate(string.Join('/', parts), NavPathMaxLength);
    }

    private static string[] SplitPath(string? path)
    {
        string value = (path ?? string.Empty).Trim();
        int queryIndex = value.IndexOfAny(['?', '#']);
        if (queryIndex >= 0)
        {
            value = value[..queryIndex];
        }

        return value
            .Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(DecodeSegment)
            .Where(segment => segment.Length > 0)
            .ToArray();
    }

    private static string DecodeSegment(string segment)
    {
        try
        {
            return Uri.UnescapeDataString(segment).Trim().ToLowerInvariant();
        }
        catch (UriFormatException)
        {
            return segment.ToLowerInvariant();
        }
    }

    private static Classification Unscoped(string area) => new(area, null, null, null, false);

    private static Classification Scoped(string area, string scopeType, string scopeKey) =>
        new(area, scopeType, Truncate(scopeKey, ScopeKeyMaxLength), null, false);

    private static string Truncate(string value, int maxLength) =>
        value.Length > maxLength ? value[..maxLength] : value;
}
