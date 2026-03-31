using System.Text;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuides;

public static class UpsertCurrentStudyGuide
{
    public const int DefaultMaxTotalBytesPerUser = 51_200; // 50 KB default

    public sealed record Request(string Title, string ContentText);

    public const int ExpiryDays = 14;

    public sealed record Response(
        string Id,
        string Title,
        int SizeBytes,
        string UpdatedUtc,
        string ExpiresAtUtc);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Title)
                .NotEmpty()
                .WithMessage("Title is required")
                .MaximumLength(200)
                .WithMessage("Title must not exceed 200 characters");

            RuleFor(x => x.ContentText)
                .NotNull()
                .WithMessage("ContentText is required");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("study-guides/current", Handler)
                .WithTags("StudyGuides")
                .WithSummary("Create or replace current user's study guide")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(request, db, userContext.UserId, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error!.Type == ErrorType.Validation
                    ? Results.BadRequest(new { failure.Error.Code, failure.Error.Description })
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        string userId,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(userId, out Guid userGuid))
            {
                return Result.Failure<Response>(
                    Error.Validation("StudyGuide.InvalidUserId", "Invalid user ID format"));
            }

            int maxBytes = DefaultMaxTotalBytesPerUser;

            // Allow per-user override via UserSettings (key: StudyGuideMaxBytes)
            UserSetting? sizeSetting = await db.UserSettings
                .FirstOrDefaultAsync(
                    us => us.UserId == userGuid && us.Key == "StudyGuideMaxBytes",
                    cancellationToken);

            if (sizeSetting is not null && int.TryParse(sizeSetting.Value, out int parsed))
            {
                // Clamp to [0, 1_000_000]; 0 means no study guide allowed (only empty text)
                if (parsed < 0) parsed = 0;
                if (parsed > 1_000_000) parsed = 1_000_000;
                maxBytes = parsed;
            }

            int sizeBytes = Encoding.UTF8.GetByteCount(request.ContentText);

            if (sizeBytes > maxBytes)
            {
                int maxKb = maxBytes / 1024;
                return Result.Failure<Response>(
                    Error.Validation(
                        "StudyGuide.SizeExceeded",
                        $"Study guide text exceeds the limit. Maximum is {maxKb} KB ({maxBytes} bytes). Current size: {sizeBytes} bytes."));
            }

            StudyGuide? existing = await db.StudyGuides
                .Where(sg => sg.UserId == userId)
                .FirstOrDefaultAsync(cancellationToken);

            var now = DateTime.UtcNow;

            DateTime expiresAt = now.AddDays(ExpiryDays);

            if (existing is not null)
            {
                existing.Title = request.Title.Trim();
                existing.ContentText = request.ContentText;
                existing.SizeBytes = sizeBytes;
                existing.UpdatedUtc = now;
                existing.ExpiresAtUtc = expiresAt;
                await db.SaveChangesAsync(cancellationToken);

                return Result.Success(new Response(
                    existing.Id.ToString(),
                    existing.Title,
                    existing.SizeBytes,
                    existing.UpdatedUtc.ToString("O"),
                    existing.ExpiresAtUtc.ToString("O")));
            }

            var guide = new StudyGuide
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Title = request.Title.Trim(),
                ContentText = request.ContentText,
                SizeBytes = sizeBytes,
                CreatedUtc = now,
                UpdatedUtc = now,
                ExpiresAtUtc = expiresAt
            };
            db.StudyGuides.Add(guide);
            await db.SaveChangesAsync(cancellationToken);

            return Result.Success(new Response(
                guide.Id.ToString(),
                guide.Title,
                guide.SizeBytes,
                guide.UpdatedUtc.ToString("O"),
                guide.ExpiresAtUtc.ToString("O")));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("StudyGuide.UpsertFailed", $"Failed to save study guide: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
