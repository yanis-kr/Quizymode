using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class AddOrUpdateCollectionRating
{
    public sealed record Request(int Stars);

    public sealed record Response(
        string Id,
        Guid CollectionId,
        int Stars,
        DateTime CreatedAt,
        DateTime? UpdatedAt);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Stars)
                .InclusiveBetween(1, 5)
                .WithMessage("Stars must be between 1 and 5");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("collections/{id:guid}/rating", Handler)
                .WithTags("Collections")
                .WithSummary("Rate a collection (or update your rating)")
                .WithDescription("Any authenticated user can rate once per collection (including owner). Stars 1-5.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
                return Results.Unauthorized();

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
                return Results.BadRequest(string.Join("; ", validationResult.Errors.Select(e => e.ErrorMessage)));

            Result<Response> result = await HandleAsync(id, request, db, userContext, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Guid collectionId,
        Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            Collection? collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == collectionId, cancellationToken);
            if (collection is null)
                return Result.Failure<Response>(Error.NotFound("Collection.NotFound", "Collection not found"));

            if (!await GetCollectionById.CanAccessCollectionAsync(db, collection, userContext, cancellationToken))
                return Result.Failure<Response>(Error.NotFound("Collection.NotFound", "Collection not found"));

            CollectionRating? existing = await db.CollectionRatings
                .FirstOrDefaultAsync(
                    r => r.CollectionId == collectionId && r.CreatedBy == userContext.UserId,
                    cancellationToken);

            if (existing is not null)
            {
                existing.Stars = request.Stars;
                existing.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(cancellationToken);
                return Result.Success(new Response(
                    existing.Id.ToString(),
                    existing.CollectionId,
                    existing.Stars,
                    existing.CreatedAt,
                    existing.UpdatedAt));
            }

            var entity = new CollectionRating
            {
                Id = Guid.NewGuid(),
                CollectionId = collectionId,
                Stars = request.Stars,
                CreatedBy = userContext.UserId!,
                CreatedAt = DateTime.UtcNow
            };
            db.CollectionRatings.Add(entity);
            await db.SaveChangesAsync(cancellationToken);
            return Result.Success(new Response(
                entity.Id.ToString(),
                entity.CollectionId,
                entity.Stars,
                entity.CreatedAt,
                entity.UpdatedAt));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("CollectionRating.Failed", ex.Message));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
