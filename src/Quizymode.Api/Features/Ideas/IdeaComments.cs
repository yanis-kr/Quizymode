using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Ideas;

public static class IdeaComments
{
    public sealed record CreateRequest(string Text);

    public sealed record UpdateRequest(string Text);

    public sealed class CreateValidator : AbstractValidator<CreateRequest>
    {
        public CreateValidator()
        {
            RuleFor(x => x.Text)
                .NotEmpty()
                .MaximumLength(2000);
        }
    }

    public sealed class UpdateValidator : AbstractValidator<UpdateRequest>
    {
        public UpdateValidator()
        {
            RuleFor(x => x.Text)
                .NotEmpty()
                .MaximumLength(2000);
        }
    }

    public sealed class GetEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("ideas/{ideaId:guid}/comments", Handler)
                .WithTags("Ideas")
                .WithSummary("Get comments for a published idea")
                .Produces<IdeaCommentsResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid ideaId,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result<IdeaCommentsResponse> result = await HandleGetAsync(ideaId, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public sealed class CreateEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("ideas/{ideaId:guid}/comments", Handler)
                .WithTags("Ideas")
                .WithSummary("Create a comment on a published idea")
                .RequireAuthorization()
                .RequireRateLimiting("ideas-comments")
                .Produces<IdeaCommentResponse>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status429TooManyRequests);
        }

        private static async Task<IResult> Handler(
            Guid ideaId,
            CreateRequest request,
            IValidator<CreateRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ITextModerationService textModerationService,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrWhiteSpace(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            FluentValidation.Results.ValidationResult validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<IdeaCommentResponse> result = await HandleCreateAsync(
                ideaId,
                request,
                db,
                userContext,
                textModerationService,
                auditService,
                cancellationToken);

            return result.Match(
                value => Results.Created($"/api/ideas/{ideaId}/comments/{value.Id}", value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public sealed class UpdateEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("ideas/{ideaId:guid}/comments/{commentId:guid}", Handler)
                .WithTags("Ideas")
                .WithSummary("Update an idea comment")
                .RequireAuthorization()
                .Produces<IdeaCommentResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid ideaId,
            Guid commentId,
            UpdateRequest request,
            IValidator<UpdateRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ITextModerationService textModerationService,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrWhiteSpace(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            FluentValidation.Results.ValidationResult validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<IdeaCommentResponse> result = await HandleUpdateAsync(
                ideaId,
                commentId,
                request,
                db,
                userContext,
                textModerationService,
                auditService,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Code == "IdeaComments.Forbidden"
                    ? Results.Forbid()
                    : failure.Error.Type == ErrorType.NotFound
                        ? Results.NotFound()
                        : CustomResults.Problem(result));
        }
    }

    public sealed class DeleteEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapDelete("ideas/{ideaId:guid}/comments/{commentId:guid}", Handler)
                .WithTags("Ideas")
                .WithSummary("Delete an idea comment")
                .RequireAuthorization()
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid ideaId,
            Guid commentId,
            ApplicationDbContext db,
            IUserContext userContext,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrWhiteSpace(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            Result result = await HandleDeleteAsync(ideaId, commentId, db, userContext, auditService, cancellationToken);

            return result.Match(
                () => Results.NoContent(),
                failure => failure.Error.Code == "IdeaComments.Forbidden"
                    ? Results.Forbid()
                    : failure.Error.Type == ErrorType.NotFound
                        ? Results.NotFound()
                        : CustomResults.Problem(result));
        }
    }

    internal static async Task<Result<IdeaCommentsResponse>> HandleGetAsync(
        Guid ideaId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            bool publishedIdeaExists = await db.Ideas.AnyAsync(
                idea => idea.Id == ideaId && idea.ModerationState == IdeaModerationState.Published,
                cancellationToken);

            if (!publishedIdeaExists)
            {
                return Result.Failure<IdeaCommentsResponse>(
                    Error.NotFound("IdeaComments.IdeaNotFound", "Idea not found."));
            }

            List<IdeaCommentResponse> comments = await IdeaFeatureSupport.BuildCommentsAsync(
                db,
                userContext,
                db.IdeaComments
                    .Where(comment => comment.IdeaId == ideaId)
                    .OrderByDescending(comment => comment.CreatedAt),
                cancellationToken);

            return Result.Success(new IdeaCommentsResponse(comments));
        }
        catch (Exception ex)
        {
            return Result.Failure<IdeaCommentsResponse>(
                Error.Problem("IdeaComments.GetFailed", $"Failed to load idea comments: {ex.Message}"));
        }
    }

    internal static async Task<Result<IdeaCommentResponse>> HandleCreateAsync(
        Guid ideaId,
        CreateRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        ITextModerationService textModerationService,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(userContext.UserId))
            {
                return Result.Failure<IdeaCommentResponse>(
                    Error.Validation("IdeaComments.UserIdMissing", "User ID is missing."));
            }

            bool publishedIdeaExists = await db.Ideas.AnyAsync(
                idea => idea.Id == ideaId && idea.ModerationState == IdeaModerationState.Published,
                cancellationToken);

            if (!publishedIdeaExists)
            {
                return Result.Failure<IdeaCommentResponse>(
                    Error.NotFound("IdeaComments.IdeaNotFound", "Idea not found."));
            }

            string normalizedText = IdeaFeatureSupport.NormalizeInput(request.Text);
            if (IdeaFeatureSupport.CountMeaningfulCharacters(normalizedText) < 3)
            {
                return Result.Failure<IdeaCommentResponse>(
                    Error.Validation("IdeaComments.TextTooShort", "Comment must contain at least 3 meaningful characters."));
            }

            TextModerationResult moderationResult = textModerationService.Evaluate(normalizedText);
            if (moderationResult.Outcome == TextModerationOutcome.Blocked)
            {
                return Result.Failure<IdeaCommentResponse>(
                    Error.Validation("IdeaComments.ProfanityBlocked", "This comment contains blocked language and could not be posted."));
            }

            IdeaComment comment = new()
            {
                Id = Guid.NewGuid(),
                IdeaId = ideaId,
                Text = normalizedText,
                CreatedBy = userContext.UserId,
                CreatedAt = DateTime.UtcNow
            };

            db.IdeaComments.Add(comment);
            await db.SaveChangesAsync(cancellationToken);

            await LogIdeaCommentAuditAsync(
                auditService,
                AuditAction.IdeaCommentCreated,
                userContext.UserId,
                comment.Id,
                moderationResult,
                cancellationToken);

            return await LoadCommentResponseAsync(comment.Id, db, userContext, cancellationToken);
        }
        catch (Exception ex)
        {
            return Result.Failure<IdeaCommentResponse>(
                Error.Problem("IdeaComments.CreateFailed", $"Failed to create idea comment: {ex.Message}"));
        }
    }

    internal static async Task<Result<IdeaCommentResponse>> HandleUpdateAsync(
        Guid ideaId,
        Guid commentId,
        UpdateRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        ITextModerationService textModerationService,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        try
        {
            IdeaComment? comment = await db.IdeaComments
                .FirstOrDefaultAsync(existing => existing.Id == commentId && existing.IdeaId == ideaId, cancellationToken);

            if (comment is null)
            {
                return Result.Failure<IdeaCommentResponse>(
                    Error.NotFound("IdeaComments.NotFound", "Comment not found."));
            }

            if (!string.Equals(comment.CreatedBy, userContext.UserId, StringComparison.Ordinal))
            {
                return Result.Failure<IdeaCommentResponse>(
                    Error.Validation("IdeaComments.Forbidden", "You can only edit your own comments."));
            }

            string normalizedText = IdeaFeatureSupport.NormalizeInput(request.Text);
            if (IdeaFeatureSupport.CountMeaningfulCharacters(normalizedText) < 3)
            {
                return Result.Failure<IdeaCommentResponse>(
                    Error.Validation("IdeaComments.TextTooShort", "Comment must contain at least 3 meaningful characters."));
            }

            TextModerationResult moderationResult = textModerationService.Evaluate(normalizedText);
            if (moderationResult.Outcome == TextModerationOutcome.Blocked)
            {
                return Result.Failure<IdeaCommentResponse>(
                    Error.Validation("IdeaComments.ProfanityBlocked", "This comment contains blocked language and could not be saved."));
            }

            comment.Text = normalizedText;
            comment.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);

            await LogIdeaCommentAuditAsync(
                auditService,
                AuditAction.IdeaCommentUpdated,
                userContext.UserId,
                comment.Id,
                moderationResult,
                cancellationToken);

            return await LoadCommentResponseAsync(comment.Id, db, userContext, cancellationToken);
        }
        catch (Exception ex)
        {
            return Result.Failure<IdeaCommentResponse>(
                Error.Problem("IdeaComments.UpdateFailed", $"Failed to update idea comment: {ex.Message}"));
        }
    }

    internal static async Task<Result> HandleDeleteAsync(
        Guid ideaId,
        Guid commentId,
        ApplicationDbContext db,
        IUserContext userContext,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        try
        {
            IdeaComment? comment = await db.IdeaComments
                .FirstOrDefaultAsync(existing => existing.Id == commentId && existing.IdeaId == ideaId, cancellationToken);

            if (comment is null)
            {
                return Result.Failure(Error.NotFound("IdeaComments.NotFound", "Comment not found."));
            }

            if (!string.Equals(comment.CreatedBy, userContext.UserId, StringComparison.Ordinal))
            {
                return Result.Failure(Error.Validation("IdeaComments.Forbidden", "You can only delete your own comments."));
            }

            db.IdeaComments.Remove(comment);
            await db.SaveChangesAsync(cancellationToken);

            await LogIdeaCommentAuditAsync(
                auditService,
                AuditAction.IdeaCommentDeleted,
                userContext.UserId,
                comment.Id,
                new TextModerationResult(TextModerationOutcome.Clean),
                cancellationToken);

            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(Error.Problem("IdeaComments.DeleteFailed", $"Failed to delete idea comment: {ex.Message}"));
        }
    }

    private static async Task<Result<IdeaCommentResponse>> LoadCommentResponseAsync(
        Guid commentId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        List<IdeaCommentResponse> comments = await IdeaFeatureSupport.BuildCommentsAsync(
            db,
            userContext,
            db.IdeaComments.Where(comment => comment.Id == commentId),
            cancellationToken);

        IdeaCommentResponse? response = comments.SingleOrDefault();
        if (response is null)
        {
            return Result.Failure<IdeaCommentResponse>(
                Error.NotFound("IdeaComments.NotFound", "Comment not found."));
        }

        return Result.Success(response);
    }

    private static async Task LogIdeaCommentAuditAsync(
        IAuditService auditService,
        AuditAction action,
        string? userId,
        Guid entityId,
        TextModerationResult moderationResult,
        CancellationToken cancellationToken)
    {
        Dictionary<string, string> metadata = new()
        {
            ["flagged"] = (moderationResult.Outcome == TextModerationOutcome.Suspicious).ToString()
        };

        if (!string.IsNullOrWhiteSpace(moderationResult.MatchingTerm))
        {
            metadata["matchingTerm"] = moderationResult.MatchingTerm;
        }

        Guid? parsedUserId = Guid.TryParse(userId, out Guid parsed) ? parsed : null;
        await auditService.LogAsync(action, parsedUserId, entityId, metadata, cancellationToken);
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<CreateRequest>, CreateValidator>();
            services.AddScoped<IValidator<UpdateRequest>, UpdateValidator>();
        }
    }
}
