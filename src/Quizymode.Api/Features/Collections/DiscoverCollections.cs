using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class DiscoverCollections
{
    public sealed record Response(List<CollectionDiscoverItem> Items, int TotalCount);

    public sealed record CollectionDiscoverItem(
        string Id,
        string Name,
        string? Description,
        string CreatedBy,
        DateTime CreatedAt,
        int ItemCount,
        bool IsBookmarked);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections/discover", Handler)
                .WithTags("Collections")
                .WithSummary("Search public collections")
                .WithDescription("Returns public collections matching the search query. Optionally includes bookmark state when authenticated.")
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            string? q,
            int? page,
            int? pageSize,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            int pageVal = Math.Clamp(page ?? 1, 1, 100);
            int pageSizeVal = Math.Clamp(pageSize ?? 20, 1, 50);

            Result<Response> result = await HandleAsync(q ?? "", pageVal, pageSizeVal, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        string query,
        int page,
        int pageSize,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            var q = db.Collections
                .Where(c => c.IsPublic)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(query))
            {
                var term = query.Trim().ToLower();
                q = q.Where(c => c.Name.ToLower().Contains(term) ||
                    (c.Description != null && c.Description.ToLower().Contains(term)));
            }

            var totalCount = await q.CountAsync(cancellationToken);

            var collectionIds = await q
                .OrderByDescending(c => c.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(c => c.Id)
                .ToListAsync(cancellationToken);

            if (collectionIds.Count == 0)
            {
                return Result.Success(new Response(new List<CollectionDiscoverItem>(), totalCount));
            }

            var collections = await db.Collections
                .Where(c => collectionIds.Contains(c.Id))
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync(cancellationToken);

            var itemCounts = await db.CollectionItems
                .Where(ci => collectionIds.Contains(ci.CollectionId))
                .GroupBy(ci => ci.CollectionId)
                .Select(g => new { CollectionId = g.Key, Count = g.Count() })
                .ToListAsync(cancellationToken);

            var countMap = itemCounts.ToDictionary(x => x.CollectionId, x => x.Count);

            HashSet<Guid>? bookmarkedIds = null;
            if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
            {
                bookmarkedIds = (await db.CollectionBookmarks
                    .Where(b => b.UserId == userContext.UserId && collectionIds.Contains(b.CollectionId))
                    .Select(b => b.CollectionId)
                    .ToListAsync(cancellationToken))
                    .ToHashSet();
            }

            var items = collections
                .OrderByDescending(c => c.CreatedAt)
                .Select(c => new CollectionDiscoverItem(
                    c.Id.ToString(),
                    c.Name,
                    c.Description,
                    c.CreatedBy,
                    c.CreatedAt,
                    countMap.GetValueOrDefault(c.Id, 0),
                    bookmarkedIds?.Contains(c.Id) ?? false))
                .ToList();

            return Result.Success(new Response(items, totalCount));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Collections.DiscoverFailed", $"Failed to discover collections: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services
        }
    }
}
