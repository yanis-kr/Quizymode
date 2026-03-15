using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

public static class UpdateCollection
{
    public sealed record Request(string Name, bool? IsPublic);

    public sealed record Response(
        string Id,
        string Name,
        DateTime CreatedAt,
        DateTime? UpdatedAt,
        bool IsPublic);

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
            app.MapPut("collections/{id}", Handler)
                .WithTags("Collections")
                .WithSummary("Update an existing collection")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string id,
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(id, request, db, userContext, cancellationToken);

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
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(id, out Guid collectionId))
            {
                return Result.Failure<Response>(
                    Error.Validation("Collection.InvalidId", "Invalid collection ID format"));
            }

            Collection? collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == collectionId, cancellationToken);

            if (collection is null)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Collection.NotFound", $"Collection with id {id} not found"));
            }

            if (string.IsNullOrEmpty(userContext.UserId) || collection.CreatedBy != userContext.UserId)
            {
                return Result.Failure<Response>(
                    Error.Validation("Collection.Forbidden", "You can only update your own collections"));
            }

            collection.Name = request.Name;
            if (request.IsPublic.HasValue)
            {
                collection.IsPublic = request.IsPublic.Value;
            }
            collection.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync(cancellationToken);

            Response response = new(
                collection.Id.ToString(),
                collection.Name,
                collection.CreatedAt,
                collection.UpdatedAt,
                collection.IsPublic);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Collections.UpdateFailed", $"Failed to update collection: {ex.Message}"));
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


