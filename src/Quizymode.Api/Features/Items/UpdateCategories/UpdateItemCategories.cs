using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Items.UpdateCategories;

public static class UpdateItemCategories
{
    public sealed record Request(
        Guid? CategoryId,
        string? CategoryName,
        bool IsPrivate);

    public sealed record CategoryResponse(
        Guid Id,
        string Name,
        bool IsPrivate);

    public sealed record Response(CategoryResponse Category);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x)
                .Must(r => r.CategoryId.HasValue || !string.IsNullOrWhiteSpace(r.CategoryName))
                .WithMessage("Either CategoryId or CategoryName must be provided");

            RuleFor(x => x.CategoryName)
                .MaximumLength(100)
                .When(x => !string.IsNullOrWhiteSpace(x.CategoryName))
                .WithMessage("CategoryName must not exceed 100 characters");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("items/{id}/category", Handler)
                .WithTags("Items")
                .WithSummary("Update category for an item")
                .WithDescription("Sets the category for an item. Must specify either CategoryId or CategoryName.")
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
            IUserContext userContext,
            ICategoryResolver categoryResolver,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await UpdateItemCategoriesHandler.HandleAsync(
                id,
                request,
                db,
                userContext,
                categoryResolver,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
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

