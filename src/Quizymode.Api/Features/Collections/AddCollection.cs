using FluentValidation;
using Microsoft.Extensions.Logging;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class AddCollection
{
    public sealed record Request(string Name);

    public sealed record Response(
        string Id,
        string Name,
        DateTime CreatedAt);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Name)
                .NotEmpty()
                .WithMessage("Name is required")
                .MaximumLength(200)
                .WithMessage("Name must not exceed 200 characters");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("collections", Handler)
                .WithTags("Collections")
                .WithSummary("Create a named private collection")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ILogger<Endpoint> logger,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                logger.LogWarning("Unauthorized attempt to create collection. IsAuthenticated: {IsAuthenticated}, UserId: {UserId}",
                    userContext.IsAuthenticated, userContext.UserId ?? "null");
                return Results.Unauthorized();
            }

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(request, db, userContext, logger, cancellationToken);

            return result.Match(
                value => Results.Created($"/api/collections/{value.Id}", value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        ILogger<Endpoint> logger,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrEmpty(userContext.UserId))
            {
                logger.LogError("UserContext.UserId is null or empty when creating collection");
                return Result.Failure<Response>(
                    Error.Validation("Collections.UserIdMissing", "User ID is missing"));
            }

            string userId = userContext.UserId;
            logger.LogInformation("Creating collection '{Name}' for user '{UserId}'", request.Name, userId);

            Collection entity = new()
            {
                Id = Guid.NewGuid(),
                Name = request.Name,
                CreatedBy = userId,
                CreatedAt = DateTime.UtcNow
            };

            db.Collections.Add(entity);
            await db.SaveChangesAsync(cancellationToken);

            Response response = new(
                entity.Id.ToString(),
                entity.Name,
                entity.CreatedAt);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Collections.CreateFailed", $"Failed to create collection: {ex.Message}"));
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


