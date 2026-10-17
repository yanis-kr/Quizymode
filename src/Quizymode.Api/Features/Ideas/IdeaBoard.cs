using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Ideas;

public static class IdeaBoard
{
    internal static async Task<Result<IdeaBoardResponse>> HandlePublicAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            List<IdeaSummaryResponse> ideas = await IdeaFeatureSupport.BuildSummariesAsync(
                db,
                userContext,
                db.Ideas
                    .Where(idea => idea.ModerationState == IdeaModerationState.Published)
                    .OrderBy(idea => idea.Status)
                    .ThenByDescending(idea => idea.UpdatedAt ?? idea.CreatedAt),
                cancellationToken);

            return Result.Success(new IdeaBoardResponse(ideas));
        }
        catch (Exception ex)
        {
            return Result.Failure<IdeaBoardResponse>(
                Error.Problem("Ideas.GetPublicFailed", $"Failed to load ideas board: {ex.Message}"));
        }
    }

    internal static async Task<Result<IdeaBoardResponse>> HandleMineAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            List<IdeaSummaryResponse> ideas = await IdeaFeatureSupport.BuildSummariesAsync(
                db,
                userContext,
                db.Ideas
                    .Where(idea => idea.CreatedBy == userContext.UserId)
                    .OrderByDescending(idea => idea.UpdatedAt ?? idea.CreatedAt),
                cancellationToken);

            return Result.Success(new IdeaBoardResponse(ideas));
        }
        catch (Exception ex)
        {
            return Result.Failure<IdeaBoardResponse>(
                Error.Problem("Ideas.GetMineFailed", $"Failed to load your ideas: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
        }
    }
}
