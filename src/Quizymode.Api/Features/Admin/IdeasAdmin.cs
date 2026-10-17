using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Ideas;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class IdeasAdmin
{
    public sealed record RejectRequest(string ModerationNotes);

    public sealed record ApproveRequest(string? ModerationNotes);

    public sealed class ApproveValidator : AbstractValidator<ApproveRequest>
    {
        public ApproveValidator()
        {
            RuleFor(x => x.ModerationNotes)
                .MaximumLength(1000);
        }
    }

    public sealed class RejectValidator : AbstractValidator<RejectRequest>
    {
        public RejectValidator()
        {
            RuleFor(x => x.ModerationNotes)
                .NotEmpty()
                .MaximumLength(1000);
        }
    }

    internal static async Task<Result<IdeaBoardResponse>> HandleListAsync(
        string? moderationState,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken,
        int? page = null,
        int? pageSize = null)
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

            IdeaBoardResponse response = await IdeaFeatureSupport.BuildPageAsync(
                db,
                userContext,
                query
                    .OrderBy(idea => idea.ModerationState)
                    .ThenByDescending(idea => idea.UpdatedAt ?? idea.CreatedAt)
                    .ThenBy(idea => idea.Id),
                page,
                pageSize,
                cancellationToken);

            return Result.Success(response);
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
        CancellationToken cancellationToken,
        string? moderationNotes = null)
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
            string normalizedNotes = IdeaFeatureSupport.NormalizeInput(moderationNotes);
            if (normalizedNotes.Length > 0)
            {
                idea.ModerationNotes = normalizedNotes;
            }

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
            services.AddScoped<IValidator<ApproveRequest>, ApproveValidator>();
            services.AddScoped<IValidator<RejectRequest>, RejectValidator>();
        }
    }
}
