using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class GetCollectionById
{
    public sealed record Response(
        string Id,
        string Name,
        string CreatedBy,
        DateTime CreatedAt,
        int ItemCount);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("collections/{id:guid}", Handler)
                .WithTags("Collections")
                .WithSummary("Get a collection by ID")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated)
            {
                return Results.Unauthorized();
            }

            Result<Response> result = await HandleAsync(id, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : failure.Error.Type == ErrorType.Validation
                        ? Results.StatusCode(StatusCodes.Status403Forbidden)
                        : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Guid id,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            Collection? collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

            if (collection is null)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Collection.NotFound", "Collection not found"));
            }

            // Authorization: allow if user is owner or admin
            var subject = userContext.UserId;
            if (collection.CreatedBy != subject && !userContext.IsAdmin)
            {
                return Result.Failure<Response>(
                    Error.Validation("Collection.AccessDenied", "Access denied"));
            }

            int itemCount = await db.CollectionItems
                .CountAsync(ci => ci.CollectionId == id, cancellationToken);

            Response response = new(
                collection.Id.ToString(),
                collection.Name,
                collection.CreatedBy,
                collection.CreatedAt,
                itemCount);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Collection.GetFailed", $"Failed to get collection: {ex.Message}"));
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

