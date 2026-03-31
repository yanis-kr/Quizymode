using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Feedback;

public static class CreateFeedbackSubmission
{
    internal const string ReportIssueType = "reportIssue";
    internal const string RequestItemsType = "requestItems";
    internal const string GeneralFeedbackType = "generalFeedback";

    private static readonly HashSet<string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ReportIssueType,
        RequestItemsType,
        GeneralFeedbackType
    };

    public sealed class Request
    {
        public required string Type { get; init; }

        public required string CurrentUrl { get; init; }

        public required string Details { get; init; }

        public string? Email { get; init; }

        public string? AdditionalKeywords { get; init; }
    }

    public sealed class Response
    {
        public required string Id { get; init; }

        public required string Type { get; init; }

        public required string CurrentUrl { get; init; }

        public required string Details { get; init; }

        public string? Email { get; init; }

        public string? AdditionalKeywords { get; init; }

        public string? UserId { get; init; }

        public required DateTime CreatedAt { get; init; }
    }

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Type)
                .NotEmpty()
                .WithMessage("Feedback type is required")
                .Must(type => AllowedTypes.Contains(type))
                .WithMessage("Feedback type is invalid");

            RuleFor(x => x.CurrentUrl)
                .NotEmpty()
                .WithMessage("Current URL is required")
                .MaximumLength(2048)
                .WithMessage("Current URL must not exceed 2048 characters")
                .Must(BeValidPageUrl)
                .WithMessage("Current URL must be a valid absolute http or https URL");

            RuleFor(x => x.Details)
                .NotEmpty()
                .WithMessage("Details are required")
                .MaximumLength(4000)
                .WithMessage("Details must not exceed 4000 characters");

            RuleFor(x => x.Email)
                .MaximumLength(320)
                .WithMessage("Email must not exceed 320 characters")
                .EmailAddress()
                .When(x => !string.IsNullOrWhiteSpace(x.Email))
                .WithMessage("Email must be a valid email address");

            RuleFor(x => x.AdditionalKeywords)
                .MaximumLength(500)
                .WithMessage("Additional keywords must not exceed 500 characters");
        }

        private static bool BeValidPageUrl(string? value)
        {
            if (!Uri.TryCreate(value, UriKind.Absolute, out Uri? uri))
            {
                return false;
            }

            return uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps;
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("feedback", Handler)
                .WithTags("Feedback")
                .WithSummary("Create a feedback submission")
                .AllowAnonymous()
                .RequireRateLimiting("feedback-submissions")
                .Produces<Response>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status429TooManyRequests);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            HttpContext httpContext,
            CancellationToken cancellationToken)
        {
            FluentValidation.Results.ValidationResult validationResult =
                await validator.ValidateAsync(request, cancellationToken);

            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(
                request,
                db,
                userContext,
                httpContext,
                cancellationToken);

            return result.Match(
                value => Results.Created($"/api/feedback/{value.Id}", value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        try
        {
            Guid? userId = null;
            if (Guid.TryParse(userContext.UserId, out Guid parsedUserId))
            {
                userId = parsedUserId;
            }

            string normalizedType = NormalizeType(request.Type);
            string currentUrl = request.CurrentUrl.Trim();
            string details = request.Details.Trim();
            string? email = NormalizeOptional(request.Email);
            string? additionalKeywords = normalizedType == RequestItemsType
                ? NormalizeOptional(request.AdditionalKeywords)
                : null;
            string? userAgent = NormalizeOptional(httpContext.Request.Headers.UserAgent.ToString());

            FeedbackSubmission entity = new()
            {
                Id = Guid.NewGuid(),
                Type = normalizedType,
                PageUrl = currentUrl,
                Details = details,
                Email = email,
                AdditionalKeywords = additionalKeywords,
                UserId = userId,
                UserAgent = userAgent,
                CreatedAt = DateTime.UtcNow
            };

            db.FeedbackSubmissions.Add(entity);
            await db.SaveChangesAsync(cancellationToken);

            Response response = new()
            {
                Id = entity.Id.ToString(),
                Type = entity.Type,
                CurrentUrl = entity.PageUrl,
                Details = entity.Details,
                Email = entity.Email,
                AdditionalKeywords = entity.AdditionalKeywords,
                UserId = entity.UserId?.ToString(),
                CreatedAt = entity.CreatedAt
            };

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Feedback.CreateFailed", $"Failed to create feedback submission: {ex.Message}"));
        }
    }

    private static string NormalizeType(string type)
    {
        if (type.Equals(ReportIssueType, StringComparison.OrdinalIgnoreCase))
        {
            return ReportIssueType;
        }

        if (type.Equals(RequestItemsType, StringComparison.OrdinalIgnoreCase))
        {
            return RequestItemsType;
        }

        return GeneralFeedbackType;
    }

    private static string? NormalizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
