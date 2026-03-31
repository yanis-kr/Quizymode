using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class CreateCategory
{
    public sealed record CreateCategoryRequest(
        string Name,
        string? Description = null,
        string? ShortDescription = null);

    public sealed record CreateCategoryResponse(
        Guid Id,
        string Name,
        string? Description,
        string? ShortDescription);

    public sealed class Validator : AbstractValidator<CreateCategoryRequest>
    {
        public Validator()
        {
            RuleFor(x => x.Name)
                .NotEmpty()
                .WithMessage("Name is required")
                .MaximumLength(100)
                .WithMessage("Name must not exceed 100 characters");
            RuleFor(x => x.Description)
                .MaximumLength(500)
                .When(x => x.Description != null);
            RuleFor(x => x.ShortDescription)
                .MaximumLength(120)
                .When(x => x.ShortDescription != null);
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("admin/categories", Handler)
                .WithTags("Admin")
                .WithSummary("Create category (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<CreateCategoryResponse>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            CreateCategoryRequest request,
            IValidator<CreateCategoryRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<CreateCategoryResponse> result = await HandleAsync(request, db, userContext.UserId, cancellationToken);

            return result.Match(
                value => Results.Created($"/admin/categories/{value.Id}", value),
                failure => failure.Error.Type == ErrorType.Conflict
                    ? Results.Conflict(failure.Error.Description)
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<CreateCategoryResponse>> HandleAsync(
        CreateCategoryRequest request,
        ApplicationDbContext db,
        string createdBy,
        CancellationToken cancellationToken)
    {
        string name = request.Name.Trim();
        bool nameExists = await db.Categories
            .AnyAsync(c => c.Name.ToLower() == name.ToLower(), cancellationToken);

        if (nameExists)
        {
            return Result.Failure<CreateCategoryResponse>(
                Error.Conflict("Admin.CategoryNameExists", $"A category named '{name}' already exists"));
        }

        Category entity = new()
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            ShortDescription = string.IsNullOrWhiteSpace(request.ShortDescription) ? null : request.ShortDescription.Trim(),
            IsPrivate = false,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow
        };

        db.Categories.Add(entity);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(new CreateCategoryResponse(
            entity.Id,
            entity.Name,
            entity.Description,
            entity.ShortDescription));
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<CreateCategoryRequest>, Validator>();
        }
    }
}
