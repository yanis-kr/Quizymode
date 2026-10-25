using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Mvc;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy.Suggestions;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Taxonomy;

/// <summary>
/// POST /taxonomy/suggest (#322): non-LLM topic suggestion. Free text in, up to <c>limit</c> full
/// (category, L1, L2) paths out. The text is read from the body (never the URL), is never logged, stored or echoed,
/// and validation messages are fixed strings for the same reason.
/// </summary>
public static class SuggestTopics
{
    public const int MaxTextLength = 5000;
    public const int DefaultLimit = 5;
    public const int MaxLimit = 10;
    public const int MaxRequestBodyBytes = 64 * 1024;

    public sealed record Request(string? Text, int? Limit);

    public sealed record Suggestion(
        string CategorySlug,
        string L1,
        string L2,
        string Path,
        string Description,
        double Score,
        IReadOnlyList<string> MatchedTerms,
        string Reason);

    public sealed record Response(IReadOnlyList<Suggestion> Suggestions);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(request => request.Text)
                .Must(text => text is null || text.Trim().Length <= MaxTextLength)
                .WithMessage($"text must be at most {MaxTextLength} characters.");

            RuleFor(request => request.Limit)
                .InclusiveBetween(1, MaxLimit)
                .When(request => request.Limit.HasValue)
                .WithMessage($"limit must be between 1 and {MaxLimit}.");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("taxonomy/suggest", Handler)
                .WithTags("Taxonomy")
                .WithSummary("Suggest topic paths for text (no LLM)")
                .WithDescription(
                    "Returns up to `limit` full category > L1 > L2 paths for the text. Matches come from the taxonomy text and " +
                    "public items only; private items never contribute. Empty or unrecognised text returns the caller's recent " +
                    "paths, then popular ones, so the list is never empty. The text is never logged or stored.")
                .RequireAuthorization()
                .RequireRateLimiting("taxonomy-suggest")
                .WithMetadata(new RequestSizeLimitAttribute(MaxRequestBodyBytes))
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces<ProblemDetails>(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces<ProblemDetails>(StatusCodes.Status429TooManyRequests);
        }

        private static async Task<IResult> Handler(
            [FromBody] Request? request,
            ApplicationDbContext db,
            IUserContext userContext,
            [FromServices] TopicSuggester suggester,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(
                request ?? new Request(null, null),
                db,
                userContext,
                suggester,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }
    }

    internal static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        TopicSuggester suggester,
        CancellationToken cancellationToken)
    {
        ValidationResult validation = new Validator().Validate(request);
        if (!validation.IsValid)
        {
            return Result.Failure<Response>(Error.Validation("TopicSuggest.Invalid", validation.Errors[0].ErrorMessage));
        }

        string? userId = userContext.IsAuthenticated && Guid.TryParse(userContext.UserId, out Guid parsedUserId)
            ? parsedUserId.ToString()
            : null;

        IReadOnlyList<TopicSuggestionResult> results = await suggester.SuggestAsync(
            request.Text?.Trim() ?? string.Empty,
            request.Limit ?? DefaultLimit,
            userId,
            db,
            cancellationToken);

        return Result.Success(new Response(results.Select(ToSuggestion).ToList()));
    }

    private static Suggestion ToSuggestion(TopicSuggestionResult result)
    {
        return new Suggestion(
            result.CategorySlug,
            result.L1,
            result.L2,
            $"{result.CategorySlug} › {result.L1} › {result.L2}",
            result.Description,
            result.Score,
            result.MatchedTerms,
            result.Reason);
    }
}
