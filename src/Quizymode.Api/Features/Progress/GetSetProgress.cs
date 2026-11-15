using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Progress;

/// <summary>
/// #685: how many items of a set the signed-in user knows. A scope is <c>s/{categorySlug}[/{keyword}[/{keyword}]]</c> (a category
/// or a navigation path) or <c>c/{collectionId}</c>, the same keys the browser uses for guest progress (AC 3.33.2).
/// </summary>
public static class GetSetProgress
{
    public const int MaxScopes = 12;
    public const int MaxNavigationKeywords = 2;

    private static readonly Regex CategorySlugPattern = new("^[a-z0-9_-]{1,64}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex KeywordPattern = new("^[a-z0-9-]{1,30}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public sealed record ScopeProgress(string Scope, int KnownCount);

    public sealed record Response(List<ScopeProgress> Scopes);

    internal sealed record ParsedScope(string Key, Guid? CollectionId, string? CategorySlug, string[] Keywords);

    /// <summary>Parses and validates the comma-separated scope list; returns an error message or null.</summary>
    internal static string? TryParse(string? scopes, out List<ParsedScope> parsed)
    {
        parsed = new List<ParsedScope>();
        if (string.IsNullOrWhiteSpace(scopes)) return "scopes is required";
        List<string> keys = scopes.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(k => k.ToLowerInvariant())
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (keys.Count == 0) return "scopes is required";
        if (keys.Count > MaxScopes) return $"At most {MaxScopes} scopes are allowed";

        foreach (string key in keys)
        {
            string[] parts = key.Split('/');
            if (parts.Length == 2 && parts[0] == "c" && Guid.TryParse(parts[1], out Guid collectionId) && collectionId != Guid.Empty)
            {
                parsed.Add(new ParsedScope(key, collectionId, null, []));
            }
            else if (parts.Length is >= 2 and <= 2 + MaxNavigationKeywords
                     && parts[0] == "s"
                     && CategorySlugPattern.IsMatch(parts[1])
                     && parts.Skip(2).All(k => KeywordPattern.IsMatch(k)))
            {
                parsed.Add(new ParsedScope(key, null, parts[1], parts.Skip(2).ToArray()));
            }
            else
            {
                return $"Invalid scope '{key}'";
            }
        }
        return null;
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("users/me/set-progress", Handler)
                .WithTags("Users")
                .WithSummary("Get the current user's known-item counts per set")
                .WithDescription("scopes is a comma-separated list of at most 12 set keys: s/{categorySlug}[/{keyword}[/{keyword}]] or c/{collectionId}. Returns, per scope, how many items the caller currently knows (answered correctly last in a live quiz or a review) that are still visible to the caller; deleted or no longer visible items do not count. Private to the caller and never cached. Requires authentication.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> Handler(
            string? scopes,
            HttpContext httpContext,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            string? error = TryParse(scopes, out List<ParsedScope> parsed);
            if (error is not null)
            {
                return CustomResults.BadRequest(error, "Validation failed");
            }

            httpContext.Response.Headers.CacheControl = "private, no-store";
            return Results.Ok(await GetAsync(db, userContext, parsed, cancellationToken));
        }
    }

    internal static async Task<Response> GetAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        List<ParsedScope> scopes,
        CancellationToken cancellationToken)
    {
        string userId = userContext.UserId!;
        List<ScopeProgress> result = new();
        foreach (ParsedScope scope in scopes)
        {
            int count = scope.CollectionId.HasValue
                ? await CountCollectionAsync(db, userContext, userId, scope.CollectionId.Value, cancellationToken)
                : await CountCategoryAsync(db, userId, scope, cancellationToken);
            result.Add(new ScopeProgress(scope.Key, count));
        }
        return new Response(result);
    }

    private static IQueryable<Guid> KnownIds(ApplicationDbContext db, string userId) =>
        db.UserItemProgress.Where(p => p.UserId == userId && p.IsKnown).Select(p => p.ItemId);

    private static async Task<int> CountCollectionAsync(
        ApplicationDbContext db, IUserContext userContext, string userId, Guid collectionId, CancellationToken ct)
    {
        Collection? collection = await db.Collections.AsNoTracking().FirstOrDefaultAsync(c => c.Id == collectionId, ct);
        if (collection is null || !await GetCollectionById.CanAccessCollectionAsync(db, collection, userContext, ct))
        {
            return 0;
        }

        // Existing AC 1.16.7 resolver: the same roster the collection page counts.
        bool hasStructure = await CollectionScope.HasStructureAsync(db, collectionId, ct);
        IQueryable<Guid> roster = CollectionScope.RosterItemIds(db, collectionId, userId, hasStructure);
        IQueryable<Guid> known = KnownIds(db, userId);
        return await db.Items.AsNoTracking()
            .Where(ItemVisibility.EligibleFor(userId))
            .Where(i => roster.Contains(i.Id) && known.Contains(i.Id))
            .CountAsync(ct);
    }

    private static async Task<int> CountCategoryAsync(ApplicationDbContext db, string userId, ParsedScope scope, CancellationToken ct)
    {
        List<Category> categories = await db.Categories.AsNoTracking()
            .Where(c => !c.IsPrivate || c.CreatedBy == userId)
            .ToListAsync(ct);
        Guid? categoryId = categories
            .FirstOrDefault(c => string.Equals(CategoryHelper.NameToSlug(c.Name), scope.CategorySlug, StringComparison.Ordinal))?.Id;
        if (categoryId is null) return 0;

        IQueryable<Item> items = db.Items.AsNoTracking()
            .Where(ItemVisibility.VisibleTo(userId))
            .Where(i => i.CategoryId == categoryId);

        Guid? parentId = null;
        for (int level = 0; level < scope.Keywords.Length; level++)
        {
            string keyword = scope.Keywords[level];
            Guid? keywordId = await db.KeywordRelations.AsNoTracking()
                .Where(kr => kr.CategoryId == categoryId && kr.ParentKeywordId == parentId)
                .Where(kr => !kr.IsPrivate || kr.CreatedBy == userId)
                .Where(kr => !kr.ChildKeyword.IsPrivate || kr.ChildKeyword.CreatedBy == userId)
                .Where(kr => (kr.ChildKeyword.Slug != null && kr.ChildKeyword.Slug.ToLower() == keyword)
                             || kr.ChildKeyword.Name.ToLower() == keyword
                             || kr.ChildKeyword.Name.ToLower().Replace(" ", "-") == keyword)
                .Select(kr => (Guid?)kr.ChildKeywordId)
                .FirstOrDefaultAsync(ct);
            if (keywordId is null) return 0;
            Guid resolved = keywordId.Value;
            items = level == 0
                ? items.Where(i => i.NavigationKeywordId1 == resolved)
                : items.Where(i => i.NavigationKeywordId2 == resolved);
            parentId = resolved;
        }

        IQueryable<Guid> known = KnownIds(db, userId);
        return await items.Where(i => known.Contains(i.Id)).CountAsync(ct);
    }
}
