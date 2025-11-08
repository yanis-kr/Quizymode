using MongoDB.Driver;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections.Get;

public static class GetCollections
{
    public sealed record Response(List<CollectionResponse> Collections);

    public sealed record CollectionResponse(
        string Id,
        string Name,
        string Description,
        string CategoryId,
        string SubcategoryId,
        string Visibility,
        DateTime CreatedAt,
        int ItemCount);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections", Handler)
                .WithTags("Collections")
                .WithSummary("Get all collections")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            MongoDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }

        internal static async Task<Result<Response>> HandleAsync(
            MongoDbContext db,
            CancellationToken cancellationToken)
        {
            try
            {
                var collections = await db.Collections
                    .Find(_ => true)
                    .ToListAsync(cancellationToken);

                var response = new Response(
                    collections.Select(c => new CollectionResponse(
                        c.Id,
                        c.Name,
                        c.Description,
                        c.CategoryId,
                        c.SubcategoryId,
                        c.Visibility,
                        c.CreatedAt,
                        c.ItemCount)).ToList());

                return Result.Success(response);
            }
            catch (Exception ex)
            {
                return Result.Failure<Response>(
                    Error.Problem("Collections.GetFailed", $"Failed to get collections: {ex.Message}"));
            }
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed for this feature
        }
    }
}

