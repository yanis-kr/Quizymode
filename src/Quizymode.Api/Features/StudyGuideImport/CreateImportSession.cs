using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideImport;

public static class CreateImportSession
{
    public sealed record Request(
        string CategoryName,
        IReadOnlyList<string> NavigationKeywordPath,
        IReadOnlyList<string>? DefaultKeywords = null,
        int TargetSetCount = 3);

    public sealed record Response(
        string SessionId,
        string StudyGuideId,
        string StudyGuideTitle,
        int StudyGuideSizeBytes);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.CategoryName)
                .NotEmpty()
                .WithMessage("CategoryName is required")
                .MaximumLength(200)
                .WithMessage("CategoryName must not exceed 200 characters");

            RuleFor(x => x.NavigationKeywordPath)
                .NotNull()
                .WithMessage("NavigationKeywordPath is required");

            RuleFor(x => x.TargetSetCount)
                .InclusiveBetween(1, 6)
                .WithMessage("TargetSetCount must be between 1 and 6");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("study-guides/import/sessions", Handler)
                .WithTags("StudyGuideImport")
                .WithSummary("Create an import session from current study guide")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
                return Results.Unauthorized();

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
                return Results.BadRequest(validationResult.Errors);

            Result<Response> result = await HandleAsync(request, db, userContext.UserId, cancellationToken);
            return result.Match(
                value => Results.Created($"/study-guides/import/sessions/{value.SessionId}", value),
                failure => failure.Error!.Type == ErrorType.NotFound ? Results.NotFound() : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        string userId,
        CancellationToken cancellationToken)
    {
        StudyGuide? guide = await db.StudyGuides
            .Where(sg => sg.UserId == userId)
            .FirstOrDefaultAsync(cancellationToken);

        if (guide is null)
            return Result.Failure<Response>(Error.NotFound("StudyGuide.NotFound", "No study guide found. Create one first."));

        var session = new StudyGuideImportSession
        {
            Id = Guid.NewGuid(),
            StudyGuideId = guide.Id,
            UserId = userId,
            CategoryName = request.CategoryName.Trim(),
            NavigationKeywordPathJson = JsonSerializer.Serialize(request.NavigationKeywordPath ?? Array.Empty<string>()),
            DefaultKeywordsJson = request.DefaultKeywords != null && request.DefaultKeywords.Count > 0
                ? JsonSerializer.Serialize(request.DefaultKeywords)
                : null,
            TargetItemsPerChunk = request.TargetSetCount,
            Status = StudyGuideImportSessionStatus.Draft,
            CreatedUtc = DateTime.UtcNow,
            UpdatedUtc = DateTime.UtcNow
        };
        db.StudyGuideImportSessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(new Response(
            session.Id.ToString(),
            guide.Id.ToString(),
            guide.Title,
            guide.SizeBytes));
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
