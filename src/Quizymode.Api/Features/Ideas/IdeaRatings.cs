using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Ideas;

public static class IdeaRatings
{
    public sealed record Request(int? Stars);

    public sealed record Response(
        string Id,
        string IdeaId,
        int? Stars,
        DateTime CreatedAt,
        DateTime? UpdatedAt);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Stars)
                .InclusiveBetween(1, 5)
                .When(x => x.Stars.HasValue)
                .WithMessage("Stars must be between 1 and 5, or null.");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("ideas/{ideaId:guid}/rating", Handler)
                .WithTags("Ideas")
                .WithSummary("Create or update the current user's rating for a published idea")
                .RequireAuthorization()
                .RequireRateLimiting("ideas-ratings")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status429TooManyRequests);
        }

        private static async Task<IResult> Handler(
            Guid ideaId,
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrWhiteSpace(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            FluentValidation.Results.ValidationResult validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(ideaId, request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    internal static async Task<Result<Response>> HandleAsync(
        Guid ideaId,
        Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(userContext.UserId))
            {
                return Result.Failure<Response>(
                    Error.Validation("IdeaRatings.UserIdMissing", "User ID is missing."));
            }

            bool publishedIdeaExists = await db.Ideas.AnyAsync(
                idea => idea.Id == ideaId && idea.ModerationState == IdeaModerationState.Published,
                cancellationToken);

            if (!publishedIdeaExists)
            {
                return Result.Failure<Response>(
                    Error.NotFound("IdeaRatings.IdeaNotFound", "Idea not found."));
            }

            IdeaRating? rating = await db.IdeaRatings
                .FirstOrDefaultAsync(
                    existing => existing.IdeaId == ideaId && existing.CreatedBy == userContext.UserId,
                    cancellationToken);

            if (rating is null)
            {
                rating = new IdeaRating
                {
                    Id = Guid.NewGuid(),
                    IdeaId = ideaId,
                    Stars = request.Stars,
                    CreatedBy = userContext.UserId,
                    CreatedAt = DateTime.UtcNow
                };

                db.IdeaRatings.Add(rating);
            }
            else
            {
                rating.Stars = request.Stars;
                rating.UpdatedAt = DateTime.UtcNow;
            }

            await db.SaveChangesAsync(cancellationToken);

            return Result.Success(new Response(
                rating.Id.ToString(),
                rating.IdeaId.ToString(),
                rating.Stars,
                rating.CreatedAt,
                rating.UpdatedAt));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("IdeaRatings.UpsertFailed", $"Failed to save rating: {ex.Message}"));
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
