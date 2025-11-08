using FluentValidation;
using MongoDB.Driver;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections.Add;

public static class AddCollection
{
    public sealed record Request(
        string Name,
        string Description,
        string CategoryId,
        string SubcategoryId,
        string Visibility = "global");

    public sealed record Response(
        string Id,
        string Name,
        string Description,
        string CategoryId,
        string SubcategoryId,
        string Visibility,
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

            RuleFor(x => x.Description)
                .MaximumLength(1000)
                .WithMessage("Description must not exceed 1000 characters");

            RuleFor(x => x.CategoryId)
                .NotEmpty()
                .WithMessage("CategoryId is required");

            RuleFor(x => x.SubcategoryId)
                .NotEmpty()
                .WithMessage("SubcategoryId is required");

            RuleFor(x => x.Visibility)
                .Must(v => v == "global" || v == "private")
                .WithMessage("Visibility must be either 'global' or 'private'");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("collections", Handler)
                .WithTags("Collections")
                .WithSummary("Create a new collection")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            MongoDbContext db,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(request, db, cancellationToken);

            return result.Match(
                value => Results.Created($"/api/collections/{value.Id}", value),
                error => CustomResults.Problem(result));
        }

        internal static async Task<Result<Response>> HandleAsync(
            Request request,
            MongoDbContext db,
            CancellationToken cancellationToken)
        {
            try
            {
                var collection = new CollectionModel
                {
                    Name = request.Name,
                    Description = request.Description,
                    CategoryId = request.CategoryId,
                    SubcategoryId = request.SubcategoryId,
                    Visibility = request.Visibility,
                    CreatedBy = "dev_user", // TODO: Get from auth context
                    CreatedAt = DateTime.UtcNow
                };

                await db.Collections.InsertOneAsync(collection, cancellationToken: cancellationToken);

                var response = new Response(
                    collection.Id,
                    collection.Name,
                    collection.Description,
                    collection.CategoryId,
                    collection.SubcategoryId,
                    collection.Visibility,
                    collection.CreatedAt);

                return Result.Success(response);
            }
            catch (Exception ex)
            {
                return Result.Failure<Response>(
                    Error.Problem("Collection.CreateFailed", $"Failed to create collection: {ex.Message}"));
            }
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

