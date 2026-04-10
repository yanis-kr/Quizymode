using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.Ideas;

public static class IdeaCrud
{
    public sealed record CreateRequest(
        string Title,
        string Problem,
        string ProposedChange,
        string? TradeOffs,
        string TurnstileToken);

    public sealed record UpdateRequest(
        string Title,
        string Problem,
        string ProposedChange,
        string? TradeOffs);

    public sealed record StatusRequest(string Status);

    public sealed class CreateValidator : AbstractValidator<CreateRequest>
    {
        public CreateValidator()
        {
            RuleFor(x => x.Title)
                .NotEmpty()
                .MaximumLength(200);

            RuleFor(x => x.Problem)
                .NotEmpty()
                .MaximumLength(4000);

            RuleFor(x => x.ProposedChange)
                .NotEmpty()
                .MaximumLength(4000);

            RuleFor(x => x.TradeOffs)
                .MaximumLength(4000);

            RuleFor(x => x.TurnstileToken)
                .NotEmpty()
                .WithMessage("Turnstile token is required.");
        }
    }

    public sealed class UpdateValidator : AbstractValidator<UpdateRequest>
    {
        public UpdateValidator()
        {
            RuleFor(x => x.Title)
                .NotEmpty()
                .MaximumLength(200);

            RuleFor(x => x.Problem)
                .NotEmpty()
                .MaximumLength(4000);

            RuleFor(x => x.ProposedChange)
                .NotEmpty()
                .MaximumLength(4000);

            RuleFor(x => x.TradeOffs)
                .MaximumLength(4000);
        }
    }

    public sealed class StatusValidator : AbstractValidator<StatusRequest>
    {
        public StatusValidator()
        {
            RuleFor(x => x.Status)
                .NotEmpty()
                .Must(value => IdeaFeatureSupport.TryParseStatus(value, out _))
                .WithMessage("Status must be one of Proposed, Planned, In Progress, Shipped, or Archived.");
        }
    }

    public sealed class CreateEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("ideas", Handler)
                .WithTags("Ideas")
                .WithSummary("Create a new idea submission")
                .WithDescription("Creates a new idea in PendingReview moderation state for the authenticated user.")
                .RequireAuthorization()
                .RequireRateLimiting("ideas-create")
                .Produces<IdeaSummaryResponse>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status409Conflict)
                .Produces(StatusCodes.Status429TooManyRequests);
        }

        private static async Task<IResult> Handler(
            CreateRequest request,
            IValidator<CreateRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ITurnstileVerificationService turnstileVerificationService,
            ITextModerationService textModerationService,
            IAuditService auditService,
            IOptions<IdeaAbuseProtectionOptions> abuseOptions,
            HttpContext httpContext,
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

            Result<IdeaSummaryResponse> result = await HandleCreateAsync(
                request,
                db,
                userContext,
                turnstileVerificationService,
                textModerationService,
                auditService,
                abuseOptions.Value,
                httpContext,
                cancellationToken);

            return result.Match(
                value => Results.Created($"/api/ideas/{value.Id}", value),
                failure => CustomResults.Problem(result));
        }
    }

    public sealed class UpdateEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("ideas/{id:guid}", Handler)
                .WithTags("Ideas")
                .WithSummary("Update an idea")
                .RequireAuthorization()
                .Produces<IdeaSummaryResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status409Conflict);
        }

        private static async Task<IResult> Handler(
            Guid id,
            UpdateRequest request,
            IValidator<UpdateRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ITextModerationService textModerationService,
            IAuditService auditService,
            HttpContext httpContext,
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

            Result<IdeaSummaryResponse> result = await HandleUpdateAsync(
                id,
                request,
                db,
                userContext,
                textModerationService,
                auditService,
                httpContext,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Code == "Ideas.Forbidden"
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
            app.MapDelete("ideas/{id:guid}", Handler)
                .WithTags("Ideas")
                .WithSummary("Delete an idea")
                .RequireAuthorization()
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            ApplicationDbContext db,
            IUserContext userContext,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrWhiteSpace(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            Result result = await HandleDeleteAsync(id, db, userContext, auditService, cancellationToken);

            return result.Match(
                () => Results.NoContent(),
                failure => failure.Error.Code == "Ideas.Forbidden"
                    ? Results.Forbid()
                    : failure.Error.Type == ErrorType.NotFound
                        ? Results.NotFound()
                        : CustomResults.Problem(result));
        }
    }

    public sealed class StatusEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("ideas/{id:guid}/status", Handler)
                .WithTags("Ideas")
                .WithSummary("Update an idea lifecycle status")
                .RequireAuthorization("Admin")
                .Produces<IdeaSummaryResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            StatusRequest request,
            IValidator<StatusRequest> validator,
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

            Result<IdeaSummaryResponse> result = await HandleStatusUpdateAsync(
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

    internal static async Task<Result<IdeaSummaryResponse>> HandleCreateAsync(
        CreateRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        ITurnstileVerificationService turnstileVerificationService,
        ITextModerationService textModerationService,
        IAuditService auditService,
        IdeaAbuseProtectionOptions abuseOptions,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(userContext.UserId))
            {
                return Result.Failure<IdeaSummaryResponse>(
                    Error.Validation("Ideas.UserIdMissing", "User ID is missing."));
            }

            TurnstileVerificationResult verificationResult = await turnstileVerificationService.VerifyAsync(
                request.TurnstileToken,
                RequestMetadataHelper.GetClientIpAddress(httpContext),
                cancellationToken);

            if (!verificationResult.IsSuccess)
            {
                return Result.Failure<IdeaSummaryResponse>(
                    Error.Validation("Ideas.TurnstileFailed", verificationResult.ErrorDetail ?? "Turnstile verification failed."));
            }

            string normalizedTitle = IdeaFeatureSupport.NormalizeInput(request.Title);
            string normalizedProblem = IdeaFeatureSupport.NormalizeInput(request.Problem);
            string normalizedProposedChange = IdeaFeatureSupport.NormalizeInput(request.ProposedChange);
            string? normalizedTradeOffs = string.IsNullOrWhiteSpace(request.TradeOffs)
                ? null
                : IdeaFeatureSupport.NormalizeInput(request.TradeOffs);

            Result validationResult = ValidateNormalizedFields(normalizedTitle, normalizedProblem, normalizedProposedChange, normalizedTradeOffs);
            if (validationResult.IsFailure)
            {
                return Result.Failure<IdeaSummaryResponse>(validationResult.Error);
            }

            TextModerationResult moderationResult = textModerationService.Evaluate(
                normalizedTitle,
                normalizedProblem,
                normalizedProposedChange,
                normalizedTradeOffs);

            if (moderationResult.Outcome == TextModerationOutcome.Blocked)
            {
                await LogProfanityRejectionAsync(
                    auditService,
                    userContext.UserId,
                    moderationResult.MatchingTerm,
                    httpContext,
                    cancellationToken);

                return Result.Failure<IdeaSummaryResponse>(
                    Error.Validation("Ideas.ProfanityBlocked", "This idea contains blocked language and could not be submitted."));
            }

            DateTime utcNow = DateTime.UtcNow;
            List<Idea> existingIdeas = await db.Ideas
                .Where(idea => idea.CreatedBy == userContext.UserId)
                .ToListAsync(cancellationToken);

            int recentIdeaCount = existingIdeas.Count(idea => idea.CreatedAt >= utcNow.AddHours(-24));
            if (abuseOptions.CreateDailyLimit > 0 && recentIdeaCount >= abuseOptions.CreateDailyLimit)
            {
                return Result.Failure<IdeaSummaryResponse>(
                    Error.Conflict("Ideas.DailyLimitExceeded", $"You can submit up to {abuseOptions.CreateDailyLimit} ideas in 24 hours."));
            }

            if (IdeaFeatureSupport.IsExactDuplicate(existingIdeas, normalizedTitle, normalizedProblem, normalizedProposedChange))
            {
                return Result.Failure<IdeaSummaryResponse>(
                    Error.Conflict("Ideas.Duplicate", "You already submitted this exact idea."));
            }

            Idea idea = new()
            {
                Id = Guid.NewGuid(),
                Title = normalizedTitle,
                Problem = normalizedProblem,
                ProposedChange = normalizedProposedChange,
                TradeOffs = normalizedTradeOffs,
                Status = IdeaStatus.Proposed,
                ModerationState = IdeaModerationState.PendingReview,
                ModerationNotes = moderationResult.Outcome == TextModerationOutcome.Suspicious
                    ? "Flagged for manual review due to suspicious phrasing."
                    : null,
                CreatedBy = userContext.UserId,
                CreatedAt = utcNow
            };

            db.Ideas.Add(idea);
            await db.SaveChangesAsync(cancellationToken);

            await LogIdeaAuditAsync(
                auditService,
                AuditAction.IdeaCreated,
                userContext.UserId,
                idea.Id,
                new Dictionary<string, string>
                {
                    ["moderationState"] = idea.ModerationState.ToString(),
                    ["status"] = idea.Status.ToString(),
                    ["flagged"] = (moderationResult.Outcome == TextModerationOutcome.Suspicious).ToString()
                },
                cancellationToken);

            return await LoadIdeaSummaryAsync(idea.Id, db, userContext, cancellationToken);
        }
        catch (Exception ex)
        {
            return Result.Failure<IdeaSummaryResponse>(
                Error.Problem("Ideas.CreateFailed", $"Failed to create idea: {ex.Message}"));
        }
    }

    internal static async Task<Result<IdeaSummaryResponse>> HandleUpdateAsync(
        Guid id,
        UpdateRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        ITextModerationService textModerationService,
        IAuditService auditService,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        try
        {
            Idea? idea = await db.Ideas.FirstOrDefaultAsync(existing => existing.Id == id, cancellationToken);
            if (idea is null)
            {
                return Result.Failure<IdeaSummaryResponse>(
                    Error.NotFound("Ideas.NotFound", "Idea not found."));
            }

            if (!IdeaFeatureSupport.CanEditIdea(idea, userContext))
            {
                return Result.Failure<IdeaSummaryResponse>(
                    Error.Validation("Ideas.Forbidden", "You can only edit your own ideas unless you are an admin."));
            }

            string normalizedTitle = IdeaFeatureSupport.NormalizeInput(request.Title);
            string normalizedProblem = IdeaFeatureSupport.NormalizeInput(request.Problem);
            string normalizedProposedChange = IdeaFeatureSupport.NormalizeInput(request.ProposedChange);
            string? normalizedTradeOffs = string.IsNullOrWhiteSpace(request.TradeOffs)
                ? null
                : IdeaFeatureSupport.NormalizeInput(request.TradeOffs);

            Result validationResult = ValidateNormalizedFields(normalizedTitle, normalizedProblem, normalizedProposedChange, normalizedTradeOffs);
            if (validationResult.IsFailure)
            {
                return Result.Failure<IdeaSummaryResponse>(validationResult.Error);
            }

            TextModerationResult moderationResult = textModerationService.Evaluate(
                normalizedTitle,
                normalizedProblem,
                normalizedProposedChange,
                normalizedTradeOffs);

            if (moderationResult.Outcome == TextModerationOutcome.Blocked)
            {
                await LogProfanityRejectionAsync(
                    auditService,
                    userContext.UserId,
                    moderationResult.MatchingTerm,
                    httpContext,
                    cancellationToken,
                    idea.Id);

                return Result.Failure<IdeaSummaryResponse>(
                    Error.Validation("Ideas.ProfanityBlocked", "This idea contains blocked language and could not be saved."));
            }

            List<Idea> existingIdeas = await db.Ideas
                .Where(existing => existing.CreatedBy == idea.CreatedBy)
                .ToListAsync(cancellationToken);

            if (IdeaFeatureSupport.IsExactDuplicate(existingIdeas, normalizedTitle, normalizedProblem, normalizedProposedChange, idea.Id))
            {
                return Result.Failure<IdeaSummaryResponse>(
                    Error.Conflict("Ideas.Duplicate", "You already have another idea with the same content."));
            }

            idea.Title = normalizedTitle;
            idea.Problem = normalizedProblem;
            idea.ProposedChange = normalizedProposedChange;
            idea.TradeOffs = normalizedTradeOffs;
            idea.UpdatedAt = DateTime.UtcNow;

            if (!userContext.IsAdmin)
            {
                if (moderationResult.Outcome == TextModerationOutcome.Suspicious)
                {
                    idea.ModerationState = IdeaModerationState.PendingReview;
                    idea.ModerationNotes = "Flagged for manual review due to suspicious phrasing.";
                    idea.ReviewedAt = null;
                    idea.ReviewedBy = null;
                }
                else
                {
                    switch (idea.ModerationState)
                    {
                        case IdeaModerationState.Published:
                        case IdeaModerationState.Rejected:
                            idea.ModerationState = IdeaModerationState.PendingReview;
                            idea.ModerationNotes = "Edited by submitter and queued for re-review.";
                            idea.ReviewedAt = null;
                            idea.ReviewedBy = null;
                            break;
                        case IdeaModerationState.PendingReview:
                            idea.ModerationNotes = null;
                            idea.ReviewedAt = null;
                            idea.ReviewedBy = null;
                            break;
                    }
                }
            }

            await db.SaveChangesAsync(cancellationToken);

            await LogIdeaAuditAsync(
                auditService,
                AuditAction.IdeaUpdated,
                userContext.UserId,
                idea.Id,
                new Dictionary<string, string>
                {
                    ["moderationState"] = idea.ModerationState.ToString(),
                    ["flagged"] = (moderationResult.Outcome == TextModerationOutcome.Suspicious).ToString()
                },
                cancellationToken);

            return await LoadIdeaSummaryAsync(idea.Id, db, userContext, cancellationToken);
        }
        catch (Exception ex)
        {
            return Result.Failure<IdeaSummaryResponse>(
                Error.Problem("Ideas.UpdateFailed", $"Failed to update idea: {ex.Message}"));
        }
    }

    internal static async Task<Result> HandleDeleteAsync(
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
                return Result.Failure(Error.NotFound("Ideas.NotFound", "Idea not found."));
            }

            if (!IdeaFeatureSupport.CanDeleteIdea(idea, userContext))
            {
                return Result.Failure(Error.Validation("Ideas.Forbidden", "You can only delete your own ideas unless you are an admin."));
            }

            db.Ideas.Remove(idea);
            await db.SaveChangesAsync(cancellationToken);

            await LogIdeaAuditAsync(
                auditService,
                AuditAction.IdeaDeleted,
                userContext.UserId,
                idea.Id,
                null,
                cancellationToken);

            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(Error.Problem("Ideas.DeleteFailed", $"Failed to delete idea: {ex.Message}"));
        }
    }

    internal static async Task<Result<IdeaSummaryResponse>> HandleStatusUpdateAsync(
        Guid id,
        StatusRequest request,
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
                    Error.NotFound("Ideas.NotFound", "Idea not found."));
            }

            IdeaFeatureSupport.TryParseStatus(request.Status, out IdeaStatus newStatus);
            idea.Status = newStatus;
            idea.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync(cancellationToken);

            await LogIdeaAuditAsync(
                auditService,
                AuditAction.IdeaStatusChanged,
                userContext.UserId,
                idea.Id,
                new Dictionary<string, string> { ["status"] = idea.Status.ToString() },
                cancellationToken);

            return await LoadIdeaSummaryAsync(idea.Id, db, userContext, cancellationToken);
        }
        catch (Exception ex)
        {
            return Result.Failure<IdeaSummaryResponse>(
                Error.Problem("Ideas.StatusUpdateFailed", $"Failed to update idea status: {ex.Message}"));
        }
    }

    private static Result ValidateNormalizedFields(
        string title,
        string problem,
        string proposedChange,
        string? tradeOffs)
    {
        if (IdeaFeatureSupport.CountMeaningfulCharacters(title) < 3)
        {
            return Result.Failure(Error.Validation("Ideas.TitleTooShort", "Title must contain at least 3 meaningful characters."));
        }

        if (IdeaFeatureSupport.CountMeaningfulCharacters(problem) < 10)
        {
            return Result.Failure(Error.Validation("Ideas.ProblemTooShort", "Problem must contain at least 10 meaningful characters."));
        }

        if (IdeaFeatureSupport.CountMeaningfulCharacters(proposedChange) < 10)
        {
            return Result.Failure(Error.Validation("Ideas.ProposedChangeTooShort", "Proposed change must contain at least 10 meaningful characters."));
        }

        if (!string.IsNullOrWhiteSpace(tradeOffs) && IdeaFeatureSupport.CountMeaningfulCharacters(tradeOffs) < 10)
        {
            return Result.Failure(Error.Validation("Ideas.TradeOffsTooShort", "Trade-offs must contain at least 10 meaningful characters when provided."));
        }

        return Result.Success();
    }

    private static async Task<Result<IdeaSummaryResponse>> LoadIdeaSummaryAsync(
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
                Error.NotFound("Ideas.NotFound", "Idea not found."));
        }

        return Result.Success(summary);
    }

    private static async Task LogProfanityRejectionAsync(
        IAuditService auditService,
        string? userId,
        string? matchingTerm,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        Guid? entityId = null)
    {
        Dictionary<string, string> metadata = new()
        {
            ["matchingTerm"] = matchingTerm ?? string.Empty,
            ["ipAddress"] = RequestMetadataHelper.GetClientIpAddress(httpContext)
        };

        await LogIdeaAuditAsync(
            auditService,
            AuditAction.IdeaProfanityRejected,
            userId,
            entityId,
            metadata,
            cancellationToken);
    }

    private static async Task LogIdeaAuditAsync(
        IAuditService auditService,
        AuditAction action,
        string? userId,
        Guid? entityId,
        Dictionary<string, string>? metadata,
        CancellationToken cancellationToken)
    {
        Guid? parsedUserId = Guid.TryParse(userId, out Guid parsed) ? parsed : null;
        await auditService.LogAsync(
            action,
            parsedUserId,
            entityId,
            metadata,
            cancellationToken);
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<CreateRequest>, CreateValidator>();
            services.AddScoped<IValidator<UpdateRequest>, UpdateValidator>();
            services.AddScoped<IValidator<StatusRequest>, StatusValidator>();
        }
    }
}
