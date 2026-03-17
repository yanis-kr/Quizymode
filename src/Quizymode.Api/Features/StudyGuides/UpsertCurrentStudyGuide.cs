using System.Text;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuides;

public static class UpsertCurrentStudyGuide
{
    public const int MaxTotalBytesPerUser = 102_400; // 100 KB

    public sealed record Request(string Title, string ContentText);

    public sealed record Response(
        string Id,
        string Title,
        int SizeBytes,
        string UpdatedUtc);

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
            int sizeBytes = Encoding.UTF8.GetByteCount(request.ContentText);

            if (sizeBytes > MaxTotalBytesPerUser)
            {
                return Result.Failure<Response>(
                    Error.Validation(
                        "StudyGuide.SizeExceeded",
                        $"Study guide text exceeds the limit. Maximum is {MaxTotalBytesPerUser / 1024} KB ({MaxTotalBytesPerUser} bytes). Current size: {sizeBytes} bytes."));
            }

            StudyGuide? existing = await db.StudyGuides
                .Where(sg => sg.UserId == userId)
                .FirstOrDefaultAsync(cancellationToken);

            var now = DateTime.UtcNow;

            if (existing is not null)
            {
                existing.Title = request.Title.Trim();
                existing.ContentText = request.ContentText;
                existing.SizeBytes = sizeBytes;
                existing.UpdatedUtc = now;
                await db.SaveChangesAsync(cancellationToken);

                return Result.Success(new Response(
                    existing.Id.ToString(),
                    existing.Title,
                    existing.SizeBytes,
                    existing.UpdatedUtc.ToString("O")));
            }

            var guide = new StudyGuide
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Title = request.Title.Trim(),
                ContentText = request.ContentText,
                SizeBytes = sizeBytes,
                CreatedUtc = now,
                UpdatedUtc = now
            };
            db.StudyGuides.Add(guide);
            await db.SaveChangesAsync(cancellationToken);

            return Result.Success(new Response(
                guide.Id.ToString(),
                guide.Title,
                guide.SizeBytes,
                guide.UpdatedUtc.ToString("O")));
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
