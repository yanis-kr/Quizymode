using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Comments;

public static class UpdateComment
{
    public sealed record Request(string Text);

    public sealed record Response(
        string Id,
        Guid ItemId,
        string Text,
        string CreatedBy,
        string? CreatedByName,
        DateTime CreatedAt,
        DateTime? UpdatedAt);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
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
            app.MapPut("comments/{id}", Handler)
                .WithTags("Comments")
                .WithSummary("Update an existing comment")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status403Forbidden)
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
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(id, request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type switch
                {
                    ErrorType.NotFound => Results.NotFound(),
                    _ => failure.Error.Code == "Comment.NotOwner" 
                        ? Results.Forbid() 
                        : CustomResults.Problem(result)
                });
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
            if (!Guid.TryParse(id, out Guid commentId))
            {
                return Result.Failure<Response>(
                    Error.Validation("Comment.InvalidId", "Invalid comment ID format"));
            }

            Comment? comment = await db.Comments
                .FirstOrDefaultAsync(c => c.Id == commentId, cancellationToken);

            if (comment is null)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Comment.NotFound", $"Comment with id {id} not found"));
            }

            // Check if user owns the comment
            if (comment.CreatedBy != userContext.UserId)
            {
                return Result.Failure<Response>(
                    Error.Validation("Comment.NotOwner", "You can only edit your own comments"));
            }

            comment.Text = request.Text;
            comment.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync(cancellationToken);

            // Fetch user name for response
            string? userName = null;
            if (Guid.TryParse(comment.CreatedBy, out Guid userId))
            {
                User? user = await db.Users
                    .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
                userName = user?.Name;
            }

            Response response = new(
                comment.Id.ToString(),
                comment.ItemId,
                comment.Text,
                comment.CreatedBy,
                userName,
                comment.CreatedAt,
                comment.UpdatedAt);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Comments.UpdateFailed", $"Failed to update comment: {ex.Message}"));
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

