using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Ideas;

public static class IdeaBoard
{
    public sealed class PublicBoardEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("ideas", Handler)
                .WithTags("Ideas")
                .WithSummary("Get the public ideas board")
                .WithDescription("Returns published ideas with rating and comment summaries.")
                .Produces<IdeaBoardResponse>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result<IdeaBoardResponse> result = await HandlePublicAsync(db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }
    }

    public sealed class MyIdeasEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("ideas/mine", Handler)
                .WithTags("Ideas")
                .WithSummary("Get the current user's ideas")
                .WithDescription("Returns the authenticated user's ideas across moderation states.")
                .RequireAuthorization()
                .Produces<IdeaBoardResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> Handler(
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrWhiteSpace(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            Result<IdeaBoardResponse> result = await HandleMineAsync(db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }
    }

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
