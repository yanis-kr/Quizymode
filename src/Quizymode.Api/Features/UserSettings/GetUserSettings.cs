using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.UserSettings;

/// <summary>
/// Feature for retrieving user settings from the database.
/// Settings are stored as key-value pairs, allowing users to customize their application experience.
/// </summary>
public static class GetUserSettings
{
    /// <summary>
    /// Response containing all settings for the current user as a dictionary of key-value pairs.
    /// </summary>
    public sealed record Response(Dictionary<string, string> Settings);

    /// <summary>
    /// API endpoint for retrieving user settings.
    /// Requires authentication - only the authenticated user can access their own settings.
    /// </summary>
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("users/settings", Handler)
                .WithTags("UserSettings")
                .WithSummary("Get all settings for the current user")
                .WithDescription("Retrieves all user-specific settings. Returns an empty dictionary if no settings exist. Requires authentication.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> Handler(
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            // Ensure user is authenticated before accessing settings
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            Result<Response> result = await HandleAsync(db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    /// <summary>
    /// Business logic handler for retrieving user settings.
    /// Loads all settings for the authenticated user and returns them as a dictionary.
    /// </summary>
    public static async Task<Result<Response>> HandleAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            // Validate user context - user ID must be present and valid
            if (string.IsNullOrEmpty(userContext.UserId))
            {
                return Result.Failure<Response>(
                    Error.Validation("UserSettings.UserIdMissing", "User ID is missing"));
            }

            if (!Guid.TryParse(userContext.UserId, out Guid userId))
            {
                return Result.Failure<Response>(
                    Error.Validation("UserSettings.InvalidUserId", "Invalid user ID format"));
            }

            // Query all settings for this user and convert to dictionary for easy lookup
            List<UserSetting> settings = await db.UserSettings
                .Where(us => us.UserId == userId)
                .ToListAsync(cancellationToken);

            Dictionary<string, string> settingsDict = settings
                .ToDictionary(us => us.Key, us => us.Value);

            Response response = new(settingsDict);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("UserSettings.GetFailed", $"Failed to get user settings: {ex.Message}"));
        }
    }
}
