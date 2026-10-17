using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Http.Logging;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.StudyGuideUploads;

/// <summary>
/// POST /study-guide-uploads: queue pasted study guide text (max 10 KB) for one-shot AI question generation.
/// Re-submitting the same normalized text returns the existing upload instead of a new job.
/// </summary>
public static class CreateStudyGuideUpload
{
    public const string RateLimitPolicy = "study-guide-uploads";

    public const int MaxKeywords = 10;

    public sealed record Request(
        string Text,
        string Category,
        string NavigationKeyword1,
        string NavigationKeyword2,
        List<string>? Keywords);

    public sealed record Response(
        string Id,
        string Status,
        bool IsDuplicate);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Text)
                .NotEmpty()
                .WithMessage("Study guide text is required.")
                .Must(text => StudyGuideUploadText.GetByteCount(text) <= StudyGuideUploadText.MaxTextBytes)
                .WithMessage($"Study guide text must not exceed {StudyGuideUploadText.MaxTextBytes / 1024} KB.");

            RuleFor(x => x.Category)
                .NotEmpty()
                .WithMessage("Category is required.")
                .MaximumLength(100)
                .WithMessage("Category must not exceed 100 characters.");

            RuleFor(x => x.NavigationKeyword1)
                .NotEmpty()
                .WithMessage("Primary topic is required.")
                .MaximumLength(30)
                .WithMessage("Primary topic must not exceed 30 characters.");

            RuleFor(x => x.NavigationKeyword2)
                .NotEmpty()
                .WithMessage("Subtopic is required.")
                .MaximumLength(30)
                .WithMessage("Subtopic must not exceed 30 characters.");

            RuleFor(x => x.Keywords)
                .Must(keywords => keywords is null || keywords.Count <= MaxKeywords)
                .WithMessage($"Cannot add more than {MaxKeywords} keywords.");

            RuleForEach(x => x.Keywords)
                .Must(keyword => KeywordHelper.IsValidKeywordNameFormat(KeywordHelper.NormalizeKeywordName(keyword ?? string.Empty)))
                .WithMessage("Keywords may contain only letters, numbers, and hyphens (max 30 characters).");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("study-guide-uploads", Handler)
                .WithTags("StudyGuideUploads")
                .WithSummary("Upload study guide text for AI question generation")
                .WithDescription("Queues up to 10 KB of pasted text for one LLM call that generates up to 20 quiz questions. " +
                    "Returns 202 with the upload id (poll GET /study-guide-uploads/{id}); returns 200 with isDuplicate=true when " +
                    "the same text was already uploaded by this user. Returns 503 when AI generation is not configured.")
                .RequireAuthorization()
                .RequireRateLimiting(RateLimitPolicy)
                .Produces<Response>(StatusCodes.Status202Accepted)
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status429TooManyRequests)
                .Produces(StatusCodes.Status503ServiceUnavailable);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ITextModerationService moderation,
            ITaxonomyItemCategoryResolver categoryResolver,
            ITaxonomyRegistry taxonomyRegistry,
            StudyGuideUploadQueue queue,
            IOptions<AnthropicOptions> anthropicOptions,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            if (!anthropicOptions.Value.IsConfigured)
            {
                return DisabledResult();
            }

            FluentValidation.Results.ValidationResult validation = await validator.ValidateAsync(request, cancellationToken);
            if (!validation.IsValid)
            {
                return Results.BadRequest(validation.Errors);
            }

            Result<Response> result = await HandleAsync(
                request,
                db,
                userContext.UserId,
                moderation,
                categoryResolver,
                taxonomyRegistry,
                queue,
                cancellationToken);

            return result.Match(
                value => value.IsDuplicate
                    ? Results.Ok(value)
                    : Results.Accepted($"/study-guide-uploads/{value.Id}", value),
                _ => CustomResults.Problem(result));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddOptions<AnthropicOptions>()
                .Bind(configuration.GetSection(AnthropicOptions.SectionName))
                .PostConfigure(options =>
                {
                    if (string.IsNullOrWhiteSpace(options.ApiKey))
                    {
                        options.ApiKey = configuration[AnthropicOptions.ApiKeyEnvironmentVariable] ?? string.Empty;
                    }
                });

            services.AddHttpClient<IStudyGuideQuestionGenerator, AnthropicQuestionGenerator>((provider, client) =>
                {
                    AnthropicOptions options = provider.GetRequiredService<IOptions<AnthropicOptions>>().Value;
                    client.Timeout = TimeSpan.FromSeconds(Math.Clamp(options.TimeoutSeconds, 10, 600));
                })
                .RedactLoggedHeaders(["x-api-key"]);

            services.AddSingleton<StudyGuideUploadQueue>();
            services.AddScoped<StudyGuideUploadProcessor>();
            services.AddHostedService<StudyGuideUploadWorker>();
            services.AddScoped<IValidator<Request>, Validator>();
            services.AddScoped<IValidator<AcceptStudyGuideUpload.Request>, AcceptStudyGuideUpload.Validator>();
        }
    }

    internal static IResult DisabledResult() =>
        Results.Problem(
            title: "StudyGuideUpload.Disabled",
            detail: "AI study guide upload is not available right now.",
            statusCode: StatusCodes.Status503ServiceUnavailable);

    internal static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        string userId,
        ITextModerationService moderation,
        ITaxonomyItemCategoryResolver categoryResolver,
        ITaxonomyRegistry taxonomyRegistry,
        StudyGuideUploadQueue queue,
        CancellationToken cancellationToken)
    {
        List<string> keywords = (request.Keywords ?? [])
            .Select(keyword => KeywordHelper.NormalizeKeywordName(keyword).ToLowerInvariant())
            .Where(keyword => keyword.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        List<string?> moderatedValues = [request.Text];
        moderatedValues.AddRange(keywords);
        if (moderation.Evaluate(moderatedValues.ToArray()).Outcome == TextModerationOutcome.Blocked)
        {
            return Result.Failure<Response>(Error.Validation(
                "StudyGuideUpload.ProfanityBlocked",
                "This study guide contains blocked language and could not be uploaded."));
        }

        Result<Category> categoryResult = await categoryResolver.ResolveForItemAsync(request.Category, cancellationToken);
        if (categoryResult.IsFailure)
        {
            return Result.Failure<Response>(Error.Validation("StudyGuideUpload.InvalidCategory", categoryResult.Error.Description));
        }

        string categoryName = categoryResult.Value.Name;
        string nav1 = KeywordHelper.NormalizeKeywordName(request.NavigationKeyword1).ToLowerInvariant();
        string nav2 = KeywordHelper.NormalizeKeywordName(request.NavigationKeyword2).ToLowerInvariant();
        if (!taxonomyRegistry.IsValidNavigationPath(categoryName, nav1, nav2))
        {
            return Result.Failure<Response>(Error.Validation(
                "StudyGuideUpload.InvalidNavigationPath",
                $"'{nav1}' / '{nav2}' is not a valid topic path for category '{categoryName}'."));
        }

        keywords.RemoveAll(keyword =>
            string.Equals(keyword, nav1, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(keyword, nav2, StringComparison.OrdinalIgnoreCase));

        string? keywordsJson = keywords.Count > 0 ? JsonSerializer.Serialize(keywords) : null;
        string hash = StudyGuideUploadText.ComputeHash(request.Text);

        StudyGuideUpload? existing = await db.StudyGuideUploads
            .FirstOrDefaultAsync(u => u.UserId == userId && u.TextHash == hash, cancellationToken);
        if (existing is not null)
        {
            if (existing.Status == StudyGuideUploadStatus.Failed)
            {
                // A failed duplicate is retried with the newly chosen topic and keywords.
                existing.CategoryName = categoryName;
                existing.NavigationKeyword1 = nav1;
                existing.NavigationKeyword2 = nav2;
                existing.KeywordsJson = keywordsJson;
                existing.Status = StudyGuideUploadStatus.Pending;
                existing.Error = null;
                existing.CompletedUtc = null;
                existing.UpdatedUtc = DateTime.UtcNow;
                await db.SaveChangesAsync(cancellationToken);
                queue.Enqueue(existing.Id);
            }

            return Result.Success(new Response(existing.Id.ToString(), existing.Status.ToString(), true));
        }

        DateTime now = DateTime.UtcNow;
        StudyGuideUpload upload = new()
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            TextHash = hash,
            InputText = request.Text.Trim(),
            CategoryName = categoryName,
            NavigationKeyword1 = nav1,
            NavigationKeyword2 = nav2,
            KeywordsJson = keywordsJson,
            Status = StudyGuideUploadStatus.Pending,
            CreatedUtc = now,
            UpdatedUtc = now
        };

        db.StudyGuideUploads.Add(upload);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Concurrent submit of the same text: the unique (UserId, TextHash) index won the race.
            db.Entry(upload).State = EntityState.Detached;
            StudyGuideUpload? raced = await db.StudyGuideUploads
                .FirstOrDefaultAsync(u => u.UserId == userId && u.TextHash == hash, cancellationToken);
            if (raced is null)
            {
                throw;
            }

            return Result.Success(new Response(raced.Id.ToString(), raced.Status.ToString(), true));
        }

        queue.Enqueue(upload.Id);
        return Result.Success(new Response(upload.Id.ToString(), upload.Status.ToString(), false));
    }
}
