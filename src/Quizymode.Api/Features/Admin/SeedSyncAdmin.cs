using FluentValidation;
using FluentValidation.Results;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Admin;

public static class SeedSyncAdmin
{
    public sealed record SeedItemRequest(
        Guid ItemId,
        string Category,
        string NavigationKeyword1,
        string NavigationKeyword2,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string? Explanation = null,
        List<string>? Keywords = null,
        string? Source = null);

    public sealed record ManifestRequest(
        string SeedSet,
        List<SeedItemRequest> Items,
        int DeltaPreviewLimit = 200);

    public sealed record SourceContext(
        string RepositoryOwner,
        string RepositoryName,
        string GitRef,
        string ResolvedCommitSha,
        string ItemsPath,
        int SourceFileCount);

    public sealed record Request(
        int SchemaVersion,
        string RepositoryOwner,
        string RepositoryName,
        string GitRef,
        int DeltaPreviewLimit = 200);

    public sealed record ChangeResponse(
        Guid ItemId,
        string Action,
        string Category,
        string NavigationKeyword1,
        string NavigationKeyword2,
        string Question,
        List<string> ChangedFields);

    public sealed record PreviewResponse(
        string RepositoryOwner,
        string RepositoryName,
        string GitRef,
        string ResolvedCommitSha,
        string ItemsPath,
        int SourceFileCount,
        string SeedSet,
        int TotalItemsInPayload,
        int ExistingItemCount,
        int AffectedItemCount,
        int CreatedCount,
        int UpdatedCount,
        int DeletedCount,
        int UnchangedCount,
        bool HasMoreChanges,
        List<ChangeResponse> Changes);

    public sealed record ApplyResponse(
        string RepositoryOwner,
        string RepositoryName,
        string GitRef,
        string ResolvedCommitSha,
        string ItemsPath,
        int SourceFileCount,
        string SeedSet,
        int TotalItemsInPayload,
        int ExistingItemCount,
        int AffectedItemCount,
        int CreatedCount,
        int UpdatedCount,
        int DeletedCount,
        int UnchangedCount,
        Guid? HistoryRunId,
        DateTime? HistoryRecordedUtc,
        bool HasMoreChanges,
        List<ChangeResponse> Changes);

    public sealed record HistoryItemResponse(
        Guid ItemId,
        string Action,
        string Category,
        string NavigationKeyword1,
        string NavigationKeyword2,
        string Question,
        List<string> ChangedFields);

    public sealed record HistoryRunResponse(
        Guid RunId,
        DateTime CreatedUtc,
        string? TriggeredByUserId,
        string RepositoryOwner,
        string RepositoryName,
        string GitRef,
        string ResolvedCommitSha,
        string ItemsPath,
        string SeedSet,
        int SourceFileCount,
        int TotalItemsInPayload,
        int ExistingItemCount,
        int AffectedItemCount,
        int CreatedCount,
        int UpdatedCount,
        int DeletedCount,
        int UnchangedCount,
        bool HasMoreChanges,
        List<HistoryItemResponse> Changes);

    public sealed record HistoryResponse(List<HistoryRunResponse> Runs);

    internal static ValidationResult ValidateManifest(ManifestRequest request)
    {
        return new ManifestValidator().Validate(request);
    }

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.SchemaVersion)
                .Equal(2)
                .WithMessage("SchemaVersion must be 2.");

            RuleFor(x => x.RepositoryOwner)
                .NotEmpty()
                .WithMessage("RepositoryOwner is required.")
                .MaximumLength(100)
                .WithMessage("RepositoryOwner must not exceed 100 characters.");

            RuleFor(x => x.RepositoryName)
                .NotEmpty()
                .WithMessage("RepositoryName is required.")
                .MaximumLength(100)
                .WithMessage("RepositoryName must not exceed 100 characters.");

            RuleFor(x => x.GitRef)
                .NotEmpty()
                .WithMessage("GitRef is required.")
                .MaximumLength(200)
                .WithMessage("GitRef must not exceed 200 characters.");

            RuleFor(x => x.DeltaPreviewLimit)
                .InclusiveBetween(0, 500)
                .WithMessage("DeltaPreviewLimit must be between 0 and 500.");
        }
    }

    private sealed class ManifestValidator : AbstractValidator<ManifestRequest>
    {
        public ManifestValidator()
        {
            RuleFor(x => x.SeedSet)
                .NotEmpty()
                .WithMessage("SeedSet is required.")
                .MaximumLength(200)
                .WithMessage("SeedSet must not exceed 200 characters.");

            RuleFor(x => x.DeltaPreviewLimit)
                .InclusiveBetween(0, 500)
                .WithMessage("DeltaPreviewLimit must be between 0 and 500.");

            RuleFor(x => x.Items)
                .NotNull()
                .WithMessage("Items is required.")
                .Must(items => items.Count > 0)
                .WithMessage("At least one item is required.")
                .Must(items => items.Count <= 5000)
                .WithMessage("Cannot sync more than 5000 items at once.")
                .Must(HaveUniqueItemIds)
                .WithMessage("ItemId values must be unique within a sync request.");

            RuleForEach(x => x.Items)
                .SetValidator(new SeedItemValidator());
        }

        private static bool HaveUniqueItemIds(List<SeedItemRequest>? items)
        {
            if (items is null)
            {
                return false;
            }

            return items.Select(i => i.ItemId).Distinct().Count() == items.Count;
        }
    }

    private sealed class SeedItemValidator : AbstractValidator<SeedItemRequest>
    {
        public SeedItemValidator()
        {
            RuleFor(x => x.ItemId)
                .NotEmpty()
                .WithMessage("ItemId is required.");

            RuleFor(x => x.Category)
                .NotEmpty()
                .WithMessage("Category is required.")
                .MaximumLength(100)
                .WithMessage("Category must not exceed 100 characters.");

            RuleFor(x => x.NavigationKeyword1)
                .NotEmpty()
                .WithMessage("NavigationKeyword1 is required.")
                .Must(KeywordHelper.IsValidKeywordNameFormat)
                .WithMessage("NavigationKeyword1 must use only letters, numbers, and hyphens (max 30 characters).");

            RuleFor(x => x.NavigationKeyword2)
                .NotEmpty()
                .WithMessage("NavigationKeyword2 is required.")
                .Must(KeywordHelper.IsValidKeywordNameFormat)
                .WithMessage("NavigationKeyword2 must use only letters, numbers, and hyphens (max 30 characters).");

            RuleFor(x => x.Question)
                .NotEmpty()
                .WithMessage("Question is required.")
                .MaximumLength(1000)
                .WithMessage("Question must not exceed 1000 characters.");

            RuleFor(x => x.CorrectAnswer)
                .NotEmpty()
                .WithMessage("CorrectAnswer is required.")
                .MaximumLength(500)
                .WithMessage("CorrectAnswer must not exceed 500 characters.");

            RuleFor(x => x.IncorrectAnswers)
                .NotNull()
                .WithMessage("IncorrectAnswers is required.")
                .Must(answers => answers.Count >= 0 && answers.Count <= 4)
                .WithMessage("IncorrectAnswers must have between 0 and 4 answers.")
                .ForEach(rule => rule
                    .NotEmpty()
                    .WithMessage("Incorrect answers cannot be empty.")
                    .MaximumLength(500)
                    .WithMessage("Each incorrect answer must not exceed 500 characters."));

            RuleFor(x => x.Explanation)
                .MaximumLength(4000)
                .When(x => x.Explanation is not null)
                .WithMessage("Explanation must not exceed 4000 characters.");

            RuleFor(x => x.Source)
                .MaximumLength(200)
                .When(x => x.Source is not null)
                .WithMessage("Source must not exceed 200 characters.");

            RuleFor(x => x.Keywords)
                .Must(keywords => keywords is null || keywords.Count <= 50)
                .WithMessage("Cannot assign more than 50 keywords to an item.");

            RuleForEach(x => x.Keywords!)
                .NotEmpty()
                .WithMessage("Keyword names cannot be empty.")
                .Must(KeywordHelper.IsValidKeywordNameFormat)
                .WithMessage("Keywords must use only letters, numbers, and hyphens (max 30 characters).");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("admin/seed-sync/preview", PreviewHandler)
                .WithTags("Admin")
                .WithSummary("Preview a repo-managed GitHub sync (Admin only)")
                .WithDescription("Fetches canonical item seed files from GitHub at a specific ref and returns the create/update delta.")
                .RequireAuthorization("Admin")
                .Produces<PreviewResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);

            app.MapPost("admin/seed-sync/apply", ApplyHandler)
                .WithTags("Admin")
                .WithSummary("Apply a repo-managed GitHub sync (Admin only)")
                .WithDescription("Fetches canonical item seed files from GitHub at a specific ref and upserts repo-managed public items.")
                .RequireAuthorization("Admin")
                .Produces<ApplyResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);

            app.MapGet("admin/seed-sync/history", HistoryHandler)
                .WithTags("Admin")
                .WithSummary("Get recent repo-managed seed sync history (Admin only)")
                .WithDescription("Returns the most recent persisted seed sync runs and their affected item changes.")
                .RequireAuthorization("Admin")
                .Produces<HistoryResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> PreviewHandler(
            Request request,
            IValidator<Request> validator,
            SeedSyncAdminService service,
            CancellationToken cancellationToken)
        {
            ValidationResult validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<PreviewResponse> result = await service.PreviewAsync(request, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }

        private static async Task<IResult> ApplyHandler(
            Request request,
            IValidator<Request> validator,
            SeedSyncAdminService service,
            CancellationToken cancellationToken)
        {
            ValidationResult validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<ApplyResponse> result = await service.ApplyAsync(request, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }

        private static async Task<IResult> HistoryHandler(
            int? take,
            int? changesPerRun,
            SeedSyncAdminService service,
            CancellationToken cancellationToken)
        {
            int resolvedTake = take ?? 5;
            int resolvedChangesPerRun = changesPerRun ?? 10;

            if (resolvedTake <= 0 || resolvedTake > 20)
            {
                return Results.BadRequest("take must be between 1 and 20.");
            }

            if (resolvedChangesPerRun < 0 || resolvedChangesPerRun > 100)
            {
                return Results.BadRequest("changesPerRun must be between 0 and 100.");
            }

            Result<HistoryResponse> result = await service.GetHistoryAsync(
                resolvedTake,
                resolvedChangesPerRun,
                cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
            services.AddScoped<SeedSyncAdminService>();
        }
    }
}
