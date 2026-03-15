using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class GetSharedWithMe
{
    public sealed record Response(List<SharedWithMeItem> Collections);

    public sealed record SharedWithMeItem(
        string Id,
        string Name,
        string CreatedBy,
        DateTime CreatedAt,
        int ItemCount,
        DateTime SharedAt);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections/shared-with-me", Handler)
                .WithTags("Collections")
                .WithSummary("Get collections shared with current user")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            Result<Response> result = await HandleAsync(db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = userContext.UserId!;

            string? userEmail = null;
            if (Guid.TryParse(userId, out var userGuid))
            {
                var user = await db.Users.AsNoTracking()
                    .Where(u => u.Id == userGuid)
                    .Select(u => new { u.Email })
                    .FirstOrDefaultAsync(cancellationToken);
                userEmail = user?.Email?.Trim().ToLowerInvariant();
            }

            var shares = await db.CollectionShares
                .Where(s => s.SharedWithUserId == userId ||
                    (userEmail != null && s.SharedWithEmail != null && s.SharedWithEmail.ToLower() == userEmail))
                .OrderByDescending(s => s.CreatedAt)
                .Select(s => new { s.CollectionId, s.CreatedAt })
                .ToListAsync(cancellationToken);

            if (shares.Count == 0)
            {
                return Result.Success(new Response(new List<SharedWithMeItem>()));
            }

            var collectionIds = shares.Select(s => s.CollectionId).Distinct().ToList();
            var sharedAtMap = shares.GroupBy(s => s.CollectionId).ToDictionary(g => g.Key, g => g.Max(s => s.CreatedAt));

            var collections = await db.Collections
                .Where(c => collectionIds.Contains(c.Id))
                .ToListAsync(cancellationToken);

            var itemCounts = await db.CollectionItems
                .Where(ci => collectionIds.Contains(ci.CollectionId))
                .GroupBy(ci => ci.CollectionId)
                .Select(g => new { CollectionId = g.Key, Count = g.Count() })
                .ToListAsync(cancellationToken);

            var countMap = itemCounts.ToDictionary(x => x.CollectionId, x => x.Count);

            var items = collections
                .Select(c => new SharedWithMeItem(
                    c.Id.ToString(),
                    c.Name,
                    c.CreatedBy,
                    c.CreatedAt,
                    countMap.GetValueOrDefault(c.Id, 0),
                    sharedAtMap.GetValueOrDefault(c.Id, c.CreatedAt)))
                .OrderByDescending(x => x.SharedAt)
                .ToList();

            return Result.Success(new Response(items));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Collections.GetSharedWithMeFailed", $"Failed to get shared collections: {ex.Message}"));
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
