using FluentValidation;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class AddCollection
{
    /// <summary>IsPublic: anyone with the link can view (default false). IsDiscoverable: listed in Discover (default false; forced false when not public).</summary>
    public sealed record Request(string Name, string? Description = null, bool? IsPublic = null, bool? IsDiscoverable = null);

    public sealed record Response(
        string Id,
        string Name,
        string? Description,
        DateTime CreatedAt,
        bool IsPublic,
        bool IsDiscoverable);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
        RuleFor(x => x.Name)
                .NotEmpty()
                .WithMessage("Name is required")
                .MaximumLength(200)
                .WithMessage("Name must not exceed 200 characters");
        RuleFor(x => x.Description)
                .MaximumLength(2000)
                .WithMessage("Description must not exceed 2000 characters")
                .When(x => x.Description != null);
    }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("collections", Handler)
                .WithTags("Collections")
                .WithSummary("Create a collection (optionally public for shareable link)")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .ProducesProblem(StatusCodes.Status429TooManyRequests)
                .RequireRateLimiting("content-writes");
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ILogger<Endpoint> logger,
            IOptions<QuotaSettings> quotaOptions,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                logger.LogWarning("Unauthorized attempt to create collection. IsAuthenticated: {IsAuthenticated}, UserId: {UserId}",
                    userContext.IsAuthenticated, userContext.UserId ?? "null");
                return CustomResults.Unauthorized();
            }

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(request, db, userContext, logger, cancellationToken, quotaOptions.Value);

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
        CancellationToken cancellationToken,
        QuotaSettings? quotas = null)
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
                IsRepoManaged = false,
                Name = request.Name,
                Description = request.Description,
                CreatedBy = userId,
                CreatedAt = DateTime.UtcNow,
                IsPublic = request.IsPublic ?? false,
                IsDiscoverable = (request.IsPublic ?? false) && (request.IsDiscoverable ?? false)
            };

            // AC 17.4/17.6: count and insert in one transaction, serialised per user.
            await using IDbContextTransaction? transaction = await CreationQuota.BeginAsync(db, cancellationToken);
            Error? quotaError = await CreationQuota.CheckCollectionsAsync(db, userContext, 1, quotas, entity.CreatedAt, cancellationToken);
            if (quotaError is not null)
            {
                return Result.Failure<Response>(quotaError);
            }

            db.Collections.Add(entity);
            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            Response response = new(
                entity.Id.ToString(),
                entity.Name,
                entity.Description,
                entity.CreatedAt,
                entity.IsPublic,
                entity.IsDiscoverable);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Collections.CreateFailed", "Failed to create collection.", ex));
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


