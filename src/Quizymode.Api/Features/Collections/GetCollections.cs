using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class GetCollections
{
    private const string DefaultCollectionName = "MyCollection";
    public sealed record Response(List<CollectionResponse> Collections);

    public sealed record CollectionResponse(string Id, string Name, DateTime CreatedAt, int ItemCount, bool IsPublic);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections", Handler)
                .WithTags("Collections")
                .WithSummary("Get collections for current user")
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
            var subject = userContext.UserId!;

            var collections = await db.Collections
                .Where(c => c.CreatedBy == subject)
                .OrderByDescending(c => c.CreatedAt)
                .Select(c => new CollectionResponse(
                    c.Id.ToString(),
                    c.Name,
                    c.CreatedAt,
                    db.CollectionItems.Count(ci => ci.CollectionId == c.Id),
                    c.IsPublic))
                .ToListAsync(cancellationToken);

            // Ensure user has at least one collection (Default) on first use
            if (collections.Count == 0)
            {
                var defaultCollection = new Collection
                {
                    Id = Guid.NewGuid(),
                    Name = DefaultCollectionName,
                    CreatedBy = subject,
                    CreatedAt = DateTime.UtcNow
                };
                db.Collections.Add(defaultCollection);
                await db.SaveChangesAsync(cancellationToken);
                collections = new List<CollectionResponse>
                {
                    new(defaultCollection.Id.ToString(), defaultCollection.Name, defaultCollection.CreatedAt, 0, false)
                };
            }

            return Result.Success(new Response(collections));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Collections.GetFailed", $"Failed to retrieve collections: {ex.Message}"));
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
