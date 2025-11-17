using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Reviews;

public static class AddReview
{
    public sealed record Request(
        Guid ItemId,
        string Reaction,
        string Comment);

    public sealed record Response(
        string Id,
        Guid ItemId,
        string Reaction,
        string Comment,
        DateTime CreatedAt);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.ItemId)
                .NotEqual(Guid.Empty)
                .WithMessage("ItemId is required");

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
            app.MapPost("reviews", Handler)
                .WithTags("Reviews")
                .WithSummary("Create a review for an item")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
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

            Result<Response> result = await HandleAsync(request, db, cancellationToken);

            return result.Match(
                value => Results.Created($"/api/reviews/{value.Id}", value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            bool itemExists = await db.Items.AnyAsync(i => i.Id == request.ItemId, cancellationToken);
            if (!itemExists)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Review.ItemNotFound", $"Item with id {request.ItemId} not found"));
            }

            Review entity = new()
            {
                Id = Guid.NewGuid(),
                ItemId = request.ItemId,
                Reaction = request.Reaction,
                Comment = request.Comment,
                CreatedBy = "dev_user",
                CreatedAt = DateTime.UtcNow
            };

            db.Reviews.Add(entity);
            await db.SaveChangesAsync(cancellationToken);

            Response response = new(
                entity.Id.ToString(),
                entity.ItemId,
                entity.Reaction,
                entity.Comment,
                entity.CreatedAt);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Reviews.CreateFailed", $"Failed to create review: {ex.Message}"));
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


