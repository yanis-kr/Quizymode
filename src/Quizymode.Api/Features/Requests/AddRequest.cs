using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using RequestEntity = Quizymode.Api.Shared.Models.Request;

namespace Quizymode.Api.Features.Requests;

public static class AddRequest
{
    public sealed record RequestDto(
        string Category,
        string Description);

    public sealed record Response(
        string Id,
        string CategoryId,
        string Description,
        string Status,
        DateTime CreatedAt);

    public sealed class Validator : AbstractValidator<RequestDto>
    {
        public Validator()
        {
            RuleFor(x => x.Category)
                .NotEmpty()
                .WithMessage("Category is required");

            RuleFor(x => x.Description)
                .NotEmpty()
                .WithMessage("Description is required")
                .MaximumLength(2000)
                .WithMessage("Description must not exceed 2000 characters");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("requests", Handler)
                .WithTags("Requests")
                .WithSummary("Submit a category request")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            RequestDto request,
            IValidator<RequestDto> validator,
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

            Result<Response> result = await HandleAsync(request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Created($"/api/requests/{value.Id}", value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        RequestDto request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrEmpty(userContext.UserId))
            {
                return Result.Failure<Response>(
                    Error.Validation("Request.UserIdMissing", "User ID is missing"));
            }

            RequestEntity entity = new()
            {
                Id = Guid.NewGuid(),
                CategoryId = request.Category,
                Description = request.Description,
                CreatedBy = userContext.UserId, // Use UserId (GUID) from Users table
                CreatedAt = DateTime.UtcNow,
                Status = "Pending"
            };

            db.Requests.Add(entity);
            await db.SaveChangesAsync(cancellationToken);

            Response response = new(
                entity.Id.ToString(),
                entity.CategoryId,
                entity.Description,
                entity.Status,
                entity.CreatedAt);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Requests.CreateFailed", $"Failed to create request: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<RequestDto>, Validator>();
        }
    }
}


