using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class UpdateCategory
{
    public sealed record Request(string Name);

    public sealed record Response(Guid Id, string Name);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Name)
                .NotEmpty()
                .WithMessage("Name is required")
                .MaximumLength(100)
                .WithMessage("Name must not exceed 100 characters");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("admin/categories/{id:guid}", Handler)
                .WithTags("Admin")
                .WithSummary("Rename category (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
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

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Guid id,
        Request request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        Category? category = await db.Categories
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

        if (category is null)
        {
            return Result.Failure<Response>(
                Error.NotFound("Admin.CategoryNotFound", $"Category {id} not found"));
        }

        string newName = request.Name.Trim();
        bool nameExists = await db.Categories
            .AnyAsync(c => c.Id != id && c.Name.ToLower() == newName.ToLower(), cancellationToken);

        if (nameExists)
        {
            return Result.Failure<Response>(
                Error.Conflict("Admin.CategoryNameExists", $"A category named '{newName}' already exists"));
        }

        category.Name = newName;
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(new Response(category.Id, category.Name));
    }
}
