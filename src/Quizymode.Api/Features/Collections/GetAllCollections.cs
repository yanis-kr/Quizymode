using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class GetAllCollections
{
    public sealed record Response(List<CollectionResponse> Collections);

    public sealed record CollectionResponse(string Id, string Name, string CreatedBy, DateTime CreatedAt);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections/all", Handler)
                .WithTags("Collections")
                .WithSummary("Get all collections from all users (Admin only)")
                .WithDescription("Admin endpoint to view names and IDs of all collections across all users.")
                .RequireAuthorization("Admin")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            var collections = await db.Collections
                .OrderByDescending(c => c.CreatedAt)
                .Select(c => new CollectionResponse(
                    c.Id.ToString(),
                    c.Name,
                    c.CreatedBy,
                    c.CreatedAt))
                .ToListAsync(cancellationToken);

            return Result.Success(new Response(collections));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Collections.GetAllFailed", $"Failed to retrieve all collections: {ex.Message}"));
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

