using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Ideas;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class IdeasAdmin
{
    public sealed record RejectRequest(string ModerationNotes);

    public sealed class RejectValidator : AbstractValidator<RejectRequest>
    {
        public RejectValidator()
        {
            RuleFor(x => x.ModerationNotes)
                .NotEmpty()
                .MaximumLength(1000);
        }
    }

    public sealed class ListEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/ideas", Handler)
                .WithTags("Admin")
                .WithSummary("Get ideas for moderation review")
                .RequireAuthorization("Admin")
                .Produces<IdeaBoardResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string? moderationState,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result<IdeaBoardResponse> result = await HandleListAsync(
                moderationState,
                db,
                userContext,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }
    }

    public sealed class ApproveEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("admin/ideas/{id:guid}/approve", Handler)
                .WithTags("Admin")
                .WithSummary("Approve an idea for publication")
                .RequireAuthorization("Admin")
                .Produces<IdeaSummaryResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            ApplicationDbContext db,
            IUserContext userContext,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            Result<IdeaSummaryResponse> result = await HandleApproveAsync(id, db, userContext, auditService, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public sealed class RejectEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("admin/ideas/{id:guid}/reject", Handler)
                .WithTags("Admin")
                .WithSummary("Reject an idea submission")
                .RequireAuthorization("Admin")
                .Produces<IdeaSummaryResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            RejectRequest request,
            IValidator<RejectRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            FluentValidation.Results.ValidationResult validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<IdeaSummaryResponse> result = await HandleRejectAsync(
                id,
                request,
                db,
                userContext,
                auditService,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    internal static async Task<Result<IdeaBoardResponse>> HandleListAsync(
        string? moderationState,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            IQueryable<Idea> query = db.Ideas.AsQueryable();

            if (!string.IsNullOrWhiteSpace(moderationState) &&
                !string.Equals(moderationState, "all", StringComparison.OrdinalIgnoreCase))
            {
                if (!Enum.TryParse(moderationState.Replace(" ", string.Empty, StringComparison.Ordinal), true, out IdeaModerationState parsedState))
                {
                    return Result.Failure<IdeaBoardResponse>(
                        Error.Validation("AdminIdeas.InvalidModerationState", "Moderation state must be PendingReview, Published, Rejected, or all."));
                }

                query = query.Where(idea => idea.ModerationState == parsedState);
            }

            List<IdeaSummaryResponse> ideas = await IdeaFeatureSupport.BuildSummariesAsync(
                db,
                userContext,
                query
                    .OrderBy(idea => idea.ModerationState)
                    .ThenByDescending(idea => idea.UpdatedAt ?? idea.CreatedAt),
                cancellationToken);

            return Result.Success(new IdeaBoardResponse(ideas));
        }
        catch (Exception ex)
        {
            return Result.Failure<IdeaBoardResponse>(
                Error.Problem("AdminIdeas.ListFailed", $"Failed to load admin ideas: {ex.Message}"));
        }
    }

    internal static async Task<Result<IdeaSummaryResponse>> HandleApproveAsync(
        Guid id,
        ApplicationDbContext db,
        IUserContext userContext,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        try
        {
            Idea? idea = await db.Ideas.FirstOrDefaultAsync(existing => existing.Id == id, cancellationToken);
            if (idea is null)
            {
                return Result.Failure<IdeaSummaryResponse>(
                    Error.NotFound("AdminIdeas.NotFound", "Idea not found."));
            }

            idea.ModerationState = IdeaModerationState.Published;
            idea.ModerationNotes = null;
            idea.ReviewedAt = DateTime.UtcNow;
            idea.ReviewedBy = userContext.UserId;
            idea.UpdatedAt = idea.ReviewedAt;

            await db.SaveChangesAsync(cancellationToken);

            await LogAuditAsync(auditService, AuditAction.IdeaApproved, userContext.UserId, idea.Id, cancellationToken);

            return await LoadAdminSummaryAsync(idea.Id, db, userContext, cancellationToken);
        }
        catch (Exception ex)
        {
            return Result.Failure<IdeaSummaryResponse>(
                Error.Problem("AdminIdeas.ApproveFailed", $"Failed to approve idea: {ex.Message}"));
        }
    }

    internal static async Task<Result<IdeaSummaryResponse>> HandleRejectAsync(
        Guid id,
        RejectRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        try
        {
            Idea? idea = await db.Ideas.FirstOrDefaultAsync(existing => existing.Id == id, cancellationToken);
            if (idea is null)
            {
                return Result.Failure<IdeaSummaryResponse>(
                    Error.NotFound("AdminIdeas.NotFound", "Idea not found."));
            }

            idea.ModerationState = IdeaModerationState.Rejected;
            idea.ModerationNotes = IdeaFeatureSupport.NormalizeInput(request.ModerationNotes);
            idea.ReviewedAt = DateTime.UtcNow;
            idea.ReviewedBy = userContext.UserId;
            idea.UpdatedAt = idea.ReviewedAt;

            await db.SaveChangesAsync(cancellationToken);

            await LogAuditAsync(auditService, AuditAction.IdeaRejected, userContext.UserId, idea.Id, cancellationToken);

            return await LoadAdminSummaryAsync(idea.Id, db, userContext, cancellationToken);
        }
        catch (Exception ex)
        {
            return Result.Failure<IdeaSummaryResponse>(
                Error.Problem("AdminIdeas.RejectFailed", $"Failed to reject idea: {ex.Message}"));
        }
    }

    private static async Task<Result<IdeaSummaryResponse>> LoadAdminSummaryAsync(
        Guid ideaId,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        List<IdeaSummaryResponse> ideas = await IdeaFeatureSupport.BuildSummariesAsync(
            db,
            userContext,
            db.Ideas.Where(idea => idea.Id == ideaId),
            cancellationToken);

        IdeaSummaryResponse? summary = ideas.SingleOrDefault();
        if (summary is null)
        {
            return Result.Failure<IdeaSummaryResponse>(
                Error.NotFound("AdminIdeas.NotFound", "Idea not found."));
        }

        return Result.Success(summary);
    }

    private static async Task LogAuditAsync(
        IAuditService auditService,
        AuditAction action,
        string? userId,
        Guid entityId,
        CancellationToken cancellationToken)
    {
        Guid? parsedUserId = Guid.TryParse(userId, out Guid parsed) ? parsed : null;
        await auditService.LogAsync(action, parsedUserId, entityId, null, cancellationToken);
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<RejectRequest>, RejectValidator>();
        }
    }
}
