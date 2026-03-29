using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuides;

public static class GetCurrentStudyGuide
{
    public sealed record Response(
        string Id,
        string Title,
        string ContentText,
        int SizeBytes,
        string CreatedUtc,
        string UpdatedUtc,
        string ExpiresAtUtc);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("study-guides/current", Handler)
                .WithTags("StudyGuides")
                .WithSummary("Get current user's study guide")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> Handler(
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            Result<Response?> result = await HandleAsync(db, userContext.UserId, cancellationToken);

            return result.Match(
                value => value is null ? Results.NotFound() : Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response?>> HandleAsync(
        ApplicationDbContext db,
        string userId,
        CancellationToken cancellationToken)
    {
        try
        {
            StudyGuide? guide = await db.StudyGuides
                .Where(sg => sg.UserId == userId)
                .FirstOrDefaultAsync(cancellationToken);

            if (guide is null)
            {
                return Result.Success<Response?>(null);
            }

            var response = new Response(
                guide.Id.ToString(),
                guide.Title,
                guide.ContentText,
                guide.SizeBytes,
                guide.CreatedUtc.ToString("O"),
                guide.UpdatedUtc.ToString("O"),
                guide.ExpiresAtUtc.ToString("O"));

            return Result.Success<Response?>(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response?>(
                Error.Problem("StudyGuide.GetFailed", $"Failed to get study guide: {ex.Message}"));
        }
    }
}
