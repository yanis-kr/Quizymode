using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Comments;

public static class AddComment
{
    public sealed record Request(
        Guid ItemId,
        string Text);

    public sealed record Response(
        string Id,
        Guid ItemId,
        string Text,
        string CreatedBy,
        string? CreatedByName,
        DateTime CreatedAt);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.ItemId)
                .NotEqual(Guid.Empty)
                .WithMessage("ItemId is required");

            RuleFor(x => x.Text)
                .NotEmpty()
                .WithMessage("Comment text is required")
                .MaximumLength(2000)
                .WithMessage("Comment must not exceed 2000 characters");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("comments", Handler)
                .WithTags("Comments")
                .WithSummary("Create a comment for an item")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            IAuditService auditService,
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

            Result<Response> result = await HandleAsync(request, db, userContext, auditService, cancellationToken);

            return result.Match(
                value => Results.Created($"/api/comments/{value.Id}", value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrEmpty(userContext.UserId))
            {
                return Result.Failure<Response>(
                    Error.Validation("Comment.UserIdMissing", "User ID is missing"));
            }

            bool itemExists = await db.Items.AnyAsync(i => i.Id == request.ItemId, cancellationToken);
            if (!itemExists)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Comment.ItemNotFound", $"Item with id {request.ItemId} not found"));
            }

            Comment entity = new()
            {
                Id = Guid.NewGuid(),
                ItemId = request.ItemId,
                Text = request.Text,
                CreatedBy = userContext.UserId,
                CreatedAt = DateTime.UtcNow
            };

            db.Comments.Add(entity);
            await db.SaveChangesAsync(cancellationToken);

            // Log audit entry
            if (Guid.TryParse(userContext.UserId, out Guid userId))
            {
                await auditService.LogAsync(
                    AuditAction.CommentCreated,
                    userId: userId,
                    entityId: entity.Id,
                    cancellationToken: cancellationToken);
            }

            // Fetch user name for response
            string? userName = null;
            if (Guid.TryParse(userContext.UserId, out Guid userIdForName))
            {
                User? user = await db.Users
                    .FirstOrDefaultAsync(u => u.Id == userIdForName, cancellationToken);
                userName = user?.Name;
            }

            Response response = new(
                entity.Id.ToString(),
                entity.ItemId,
                entity.Text,
                entity.CreatedBy,
                userName,
                entity.CreatedAt);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Comments.CreateFailed", $"Failed to create comment: {ex.Message}"));
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

