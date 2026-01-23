using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Ratings;

public static class AddOrUpdateRating
{
    public sealed record Request(
        Guid ItemId,
        int? Stars); // null or 1-5

    public sealed record Response(
        string Id,
        Guid ItemId,
        int? Stars,
        DateTime CreatedAt,
        DateTime? UpdatedAt);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.ItemId)
                .NotEqual(Guid.Empty)
                .WithMessage("ItemId is required");

            RuleFor(x => x.Stars)
                .InclusiveBetween(1, 5)
                .When(x => x.Stars.HasValue)
                .WithMessage("Stars must be between 1 and 5, or null");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("ratings", Handler)
                .WithTags("Ratings")
                .WithSummary("Create or update a rating for an item")
                .WithDescription("Creates a new rating or updates existing rating for the current user. Stars can be null or 1-5.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            IMemoryCache cache,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                string errors = string.Join("; ", validationResult.Errors.Select(e => e.ErrorMessage));
                return CustomResults.BadRequest(errors, "Validation failed");
            }

            Result<Response> result = await HandleAsync(request, db, userContext, cache, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        IMemoryCache cache,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrEmpty(userContext.UserId))
            {
                return Result.Failure<Response>(
                    Error.Validation("Rating.UserIdMissing", "User ID is missing"));
            }

            bool itemExists = await db.Items.AnyAsync(i => i.Id == request.ItemId, cancellationToken);
            if (!itemExists)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Rating.ItemNotFound", $"Item with id {request.ItemId} not found"));
            }

            // Check if user already has a rating for this item
            Rating? existingRating = await db.Ratings
                .FirstOrDefaultAsync(
                    r => r.ItemId == request.ItemId && r.CreatedBy == userContext.UserId,
                    cancellationToken);

            if (existingRating is not null)
            {
                // Update existing rating
                existingRating.Stars = request.Stars;
                existingRating.UpdatedAt = DateTime.UtcNow;

                await db.SaveChangesAsync(cancellationToken);

                // Invalidate categories cache for all users (ratings affect category averages)
                InvalidateCategoriesCache(cache);

                Response response = new(
                    existingRating.Id.ToString(),
                    existingRating.ItemId,
                    existingRating.Stars,
                    existingRating.CreatedAt,
                    existingRating.UpdatedAt);

                return Result.Success(response);
            }
            else
            {
                // Create new rating
                Rating entity = new()
                {
                    Id = Guid.NewGuid(),
                    ItemId = request.ItemId,
                    Stars = request.Stars,
                    CreatedBy = userContext.UserId,
                    CreatedAt = DateTime.UtcNow
                };

                db.Ratings.Add(entity);
                await db.SaveChangesAsync(cancellationToken);

                // Invalidate categories cache for all users (ratings affect category averages)
                InvalidateCategoriesCache(cache);

                Response response = new(
                    entity.Id.ToString(),
                    entity.ItemId,
                    entity.Stars,
                    entity.CreatedAt,
                    entity.UpdatedAt);

                return Result.Success(response);
            }
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Ratings.CreateOrUpdateFailed", $"Failed to create or update rating: {ex.Message}"));
        }
    }

    private static void InvalidateCategoriesCache(IMemoryCache cache)
    {
        // Invalidate all category caches by incrementing the cache version
        // Since MemoryCache doesn't support pattern-based removal, we use a version number
        // in the cache key and increment it to effectively invalidate all category caches
        string cacheVersionKey = "categories:cache:version";
        int currentVersion = cache.GetOrCreate(cacheVersionKey, entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24);
            return 0;
        });
        
        cache.Set(cacheVersionKey, currentVersion + 1, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24)
        });
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}

