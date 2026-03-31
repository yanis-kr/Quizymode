using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuides;

public static class DeleteCurrentStudyGuide
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapDelete("study-guides/current", Handler)
                .WithTags("StudyGuides")
                .WithSummary("Delete current user's study guide")
                .RequireAuthorization()
                .Produces(StatusCodes.Status204NoContent)
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

            Result result = await HandleAsync(db, userContext.UserId, cancellationToken);

            return result.Match(
                () => Results.NoContent(),
                _ => CustomResults.Problem(result));
        }
    }

    public static async Task<Result> HandleAsync(
        ApplicationDbContext db,
        string userId,
        CancellationToken cancellationToken)
    {
        try
        {
            StudyGuide? guide = await db.StudyGuides
                .Where(sg => sg.UserId == userId)
                .FirstOrDefaultAsync(cancellationToken);

            if (guide is not null)
            {
                db.StudyGuides.Remove(guide);
                await db.SaveChangesAsync(cancellationToken);
            }

            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(
                Error.Problem("StudyGuide.DeleteFailed", $"Failed to delete study guide: {ex.Message}"));
        }
    }
}
