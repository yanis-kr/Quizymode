using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Reviews;

public static class UpdateReview
{
    public sealed record Request(
        string Reaction,
        string Comment);

    public sealed record Response(
        string Id,
        Guid ItemId,
        string Reaction,
        string Comment,
        DateTime CreatedAt,
        DateTime? UpdatedAt);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Reaction)
                .NotEmpty()
                .WithMessage("Reaction is required")
                .MaximumLength(50)
                .WithMessage("Reaction must not exceed 50 characters");

            RuleFor(x => x.Comment)
                .MaximumLength(2000)
                .WithMessage("Comment must not exceed 2000 characters");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("reviews/{id}", Handler)
                .WithTags("Reviews")
                .WithSummary("Update an existing review")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string id,
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(id, request, db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        string id,
        Request request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(id, out Guid reviewId))
            {
                return Result.Failure<Response>(
                    Error.Validation("Review.InvalidId", "Invalid review ID format"));
            }

            Review? review = await db.Reviews
                .FirstOrDefaultAsync(r => r.Id == reviewId, cancellationToken);

            if (review is null)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Review.NotFound", $"Review with id {id} not found"));
            }

            review.Reaction = request.Reaction;
            review.Comment = request.Comment;
            review.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync(cancellationToken);

            Response response = new(
                review.Id.ToString(),
                review.ItemId,
                review.Reaction,
                review.Comment,
                review.CreatedAt,
                review.UpdatedAt);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Reviews.UpdateFailed", $"Failed to update review: {ex.Message}"));
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


