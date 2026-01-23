using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.UserSettings;

/// <summary>
/// Feature for updating or creating user settings.
/// Settings are key-value pairs that persist user preferences across sessions.
/// </summary>
public static class UpdateUserSetting
{
    /// <summary>
    /// Request DTO for updating a user setting.
    /// Contains the setting key and value to store.
    /// </summary>
    public sealed record Request(string Key, string Value);

    /// <summary>
    /// Response DTO containing the updated setting information.
    /// </summary>
    public sealed record Response(string Key, string Value, DateTime UpdatedAt);

    /// <summary>
    /// FluentValidation validator for the UpdateUserSetting request.
    /// Ensures key and value meet validation requirements before processing.
    /// </summary>
    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            // Setting key must be provided and not exceed database constraint
            RuleFor(x => x.Key)
                .NotEmpty()
                .WithMessage("Setting key is required")
                .MaximumLength(100)
                .WithMessage("Setting key must not exceed 100 characters");

            // Setting value must be provided and not exceed database constraint
            RuleFor(x => x.Value)
                .NotNull()
                .WithMessage("Setting value is required")
                .MaximumLength(500)
                .WithMessage("Setting value must not exceed 500 characters");
        }
    }

    /// <summary>
    /// API endpoint for updating or creating a user setting.
    /// Uses PUT method to indicate idempotent operation - multiple calls with same key-value result in same state.
    /// Requires authentication - users can only update their own settings.
    /// </summary>
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("users/settings", Handler)
                .WithTags("UserSettings")
                .WithSummary("Update or create a user setting")
                .WithDescription("Updates an existing setting or creates a new one if it doesn't exist. Requires authentication.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
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
            // Validate request before processing
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            // Ensure user is authenticated before updating settings
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            Result<Response> result = await HandleAsync(request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    /// <summary>
    /// Business logic handler for updating or creating a user setting.
    /// Implements upsert logic: if setting exists, update it; otherwise create new one.
    /// Updates the UpdatedAt timestamp on modification.
    /// </summary>
    public static async Task<Result<Response>> HandleAsync(
        Request request,
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

            // Try to find existing setting for this user and key
            UserSetting? existingSetting = await db.UserSettings
                .FirstOrDefaultAsync(
                    us => us.UserId == userId && us.Key == request.Key,
                    cancellationToken);

            DateTime updatedAt;
            if (existingSetting is not null)
            {
                // Update existing setting
                existingSetting.Value = request.Value;
                existingSetting.UpdatedAt = DateTime.UtcNow;
                updatedAt = existingSetting.UpdatedAt;
            }
            else
            {
                // Create new setting
                DateTime now = DateTime.UtcNow;
                UserSetting newSetting = new()
                {
                    UserId = userId,
                    Key = request.Key,
                    Value = request.Value,
                    CreatedAt = now,
                    UpdatedAt = now
                };
                db.UserSettings.Add(newSetting);
                updatedAt = newSetting.UpdatedAt;
            }

            // Persist changes to database
            await db.SaveChangesAsync(cancellationToken);

            Response response = new(request.Key, request.Value, updatedAt);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("UserSettings.UpdateFailed", $"Failed to update user setting: {ex.Message}"));
        }
    }

    /// <summary>
    /// Feature registration for dependency injection setup.
    /// Registers the FluentValidation validator for the Request DTO.
    /// </summary>
    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
