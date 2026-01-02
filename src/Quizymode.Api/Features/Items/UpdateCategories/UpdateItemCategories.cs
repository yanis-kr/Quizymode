using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Items.UpdateCategories;

public static class UpdateItemCategories
{
    public sealed record CategoryAssignment(
        int Depth,
        Guid? CategoryId,
        string? Name,
        bool IsPrivate);

    public sealed record Request(List<CategoryAssignment> Assignments);

    public sealed record CategoryResponse(
        Guid Id,
        string Name,
        int Depth,
        bool IsPrivate);

    public sealed record Response(List<CategoryResponse> Categories);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Assignments)
                .NotNull()
                .WithMessage("Assignments is required")
                .Must(assignments => assignments.Count > 0)
                .WithMessage("At least one assignment is required");

            RuleForEach(x => x.Assignments)
                .SetValidator(new CategoryAssignmentValidator());
        }
    }

    public sealed class CategoryAssignmentValidator : AbstractValidator<CategoryAssignment>
    {
        public CategoryAssignmentValidator()
        {
            RuleFor(x => x.Depth)
                .GreaterThan(0)
                .WithMessage("Depth must be greater than 0");

            RuleFor(x => x)
                .Must(a => a.CategoryId.HasValue || !string.IsNullOrWhiteSpace(a.Name))
                .WithMessage("Either CategoryId or Name must be provided");

            RuleFor(x => x.Name)
                .MaximumLength(100)
                .When(x => !string.IsNullOrWhiteSpace(x.Name))
                .WithMessage("Name must not exceed 100 characters");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("items/{id}/categories", Handler)
                .WithTags("Items")
                .WithSummary("Update categories for an item")
                .WithDescription("Replaces all category assignments for an item. Each assignment must specify either CategoryId or Name.")
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

