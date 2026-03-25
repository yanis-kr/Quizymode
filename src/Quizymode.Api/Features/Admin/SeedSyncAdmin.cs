using FluentValidation;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Admin;

public static class SeedSyncAdmin
{
    public sealed record SeedItemRequest(
        Guid SeedId,
        string Category,
        string NavigationKeyword1,
        string NavigationKeyword2,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string? Explanation = null,
        List<string>? Keywords = null,
        string? Source = null);

    public sealed record Request(
        int SchemaVersion,
        string SeedSet,
        List<SeedItemRequest> Items,
        int DeltaPreviewLimit = 200);

    public sealed record ChangeResponse(
        Guid SeedId,
        string Action,
        string Category,
        string NavigationKeyword1,
        string NavigationKeyword2,
        string Question,
        List<string> ChangedFields);

    public sealed record PreviewResponse(
        string SeedSet,
        bool IsInitialSeed,
        bool PreviewSuppressed,
        int TotalItemsInPayload,
        int ExistingManagedItemCount,
        int CreatedCount,
        int UpdatedCount,
        int AdoptedCount,
        int UnchangedCount,
        int MissingFromPayloadCount,
        bool HasMoreChanges,
        List<ChangeResponse> Changes);

    public sealed record ApplyResponse(
        string SeedSet,
        bool IsInitialSeed,
        int TotalItemsInPayload,
        int ExistingManagedItemCount,
        int CreatedCount,
        int UpdatedCount,
        int AdoptedCount,
        int UnchangedCount,
        int MissingFromPayloadCount,
        bool HasMoreChanges,
        List<ChangeResponse> Changes);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.SchemaVersion)
                .Equal(1)
                .WithMessage("SchemaVersion must be 1.");

            RuleFor(x => x.SeedSet)
                .NotEmpty()
                .WithMessage("SeedSet is required.")
                .MaximumLength(100)
                .WithMessage("SeedSet must not exceed 100 characters.");

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
                .Must(HaveUniqueSeedIds)
                .WithMessage("SeedId values must be unique within a sync request.");

            RuleForEach(x => x.Items)
                .SetValidator(new SeedItemValidator());
        }

        private static bool HaveUniqueSeedIds(List<SeedItemRequest>? items)
        {
            if (items is null)
            {
                return false;
            }

            return items.Select(i => i.SeedId).Distinct().Count() == items.Count;
        }
    }

    private sealed class SeedItemValidator : AbstractValidator<SeedItemRequest>
    {
        public SeedItemValidator()
        {
            RuleFor(x => x.SeedId)
                .NotEmpty()
                .WithMessage("SeedId is required.");

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
                .WithSummary("Preview a repo-managed seed sync (Admin only)")
                .WithDescription("Validates an uploaded seed manifest and returns only the delta for existing seeded items. Initial seed previews suppress the full item list.")
                .RequireAuthorization("Admin")
                .Produces<PreviewResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);

            app.MapPost("admin/seed-sync/apply", ApplyHandler)
                .WithTags("Admin")
                .WithSummary("Apply a repo-managed seed sync (Admin only)")
                .WithDescription("Upserts a repo-managed seed set using stable item seed IDs. Missing seeded rows in the database are recreated from the manifest.")
                .RequireAuthorization("Admin")
                .Produces<ApplyResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> PreviewHandler(
            Request request,
            IValidator<Request> validator,
            SeedSyncAdminService service,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
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
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<ApplyResponse> result = await service.ApplyAsync(request, cancellationToken);
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
