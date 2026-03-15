using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class ShareCollection
{
    /// <summary>
    /// Share with a user by their user id (for Phase 1). Phase 2 can add emails.
    /// </summary>
    public sealed record Request(string? UserId, string? Email);

    public sealed record Response(string ShareId);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x)
                .Must(x => !string.IsNullOrWhiteSpace(x.UserId) || !string.IsNullOrWhiteSpace(x.Email))
                .WithMessage("Either UserId or Email is required");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("collections/{id:guid}/share", Handler)
                .WithTags("Collections")
                .WithSummary("Share a collection with a user or email")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status201Created)
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
            {
                return Results.Unauthorized();
            }

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(id, request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Created($"/api/collections/{id}/shares/{value.ShareId}", value),
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
            var collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == collectionId, cancellationToken);
            if (collection is null)
            {
                return Result.Failure<Response>(Error.NotFound("Collection.NotFound", "Collection not found"));
            }

            if (collection.CreatedBy != userContext.UserId)
            {
                return Result.Failure<Response>(
                    Error.Validation("Collection.Forbidden", "You can only share your own collections"));
            }

            string? sharedWithUserId = null;
            string? sharedWithEmail = null;

            if (!string.IsNullOrWhiteSpace(request.UserId))
            {
                sharedWithUserId = request.UserId.Trim();
                if (sharedWithUserId == userContext.UserId)
                {
                    return Result.Failure<Response>(
                        Error.Validation("Collection.CannotShareWithSelf", "Cannot share with yourself"));
                }
            }

            if (!string.IsNullOrWhiteSpace(request.Email))
            {
                sharedWithEmail = request.Email.Trim().ToLowerInvariant();
            }

            var existing = await db.CollectionShares
                .AnyAsync(s =>
                    s.CollectionId == collectionId &&
                    (s.SharedWithUserId == sharedWithUserId || s.SharedWithEmail == sharedWithEmail),
                    cancellationToken);
            if (existing)
            {
                return Result.Failure<Response>(
                    Error.Validation("Collection.AlreadyShared", "Collection is already shared with this user or email"));
            }

            var share = new CollectionShare
            {
                Id = Guid.NewGuid(),
                CollectionId = collectionId,
                SharedBy = userContext.UserId!,
                SharedWithUserId = sharedWithUserId,
                SharedWithEmail = sharedWithEmail,
                CreatedAt = DateTime.UtcNow
            };
            db.CollectionShares.Add(share);
            await db.SaveChangesAsync(cancellationToken);

            return Result.Success(new Response(share.Id.ToString()));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Collections.ShareFailed", $"Failed to share collection: {ex.Message}"));
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
