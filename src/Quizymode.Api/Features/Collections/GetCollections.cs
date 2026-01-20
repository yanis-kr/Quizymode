using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Collections;

public static class GetCollections
{
    public sealed record Response(List<CollectionResponse> Collections);

    public sealed record CollectionResponse(string Id, string Name, DateTime CreatedAt, int ItemCount);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections", Handler)
                .WithTags("Collections")
                .WithSummary("Get collections for current user")
                .RequireAuthorization()
                .WithOpenApi()
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
            // Match collection.CreatedBy to user subject or name identifier stored in UserContext.UserId
            var subject = userContext.UserId!;

            var collections = await db.Collections
                .Where(c => c.CreatedBy == subject)
                .OrderByDescending(c => c.CreatedAt)
                .Select(c => new CollectionResponse(
                    c.Id.ToString(),
                    c.Name,
                    c.CreatedAt,
                    db.CollectionItems.Count(ci => ci.CollectionId == c.Id)))
                .ToListAsync(cancellationToken);

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
