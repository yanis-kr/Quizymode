using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class AdminUserSettings
{
    public sealed record SettingsResponse(Dictionary<string, string> Settings);

    public sealed record UpdateRequest(string Key, string Value);

    public sealed record UpdateResponse(string Key, string Value, DateTime UpdatedAt);

    public sealed class UpdateValidator : AbstractValidator<UpdateRequest>
    {
        public UpdateValidator()
        {
            RuleFor(x => x.Key)
                .NotEmpty()
                .MaximumLength(100);

            RuleFor(x => x.Value)
                .NotNull()
                .MaximumLength(500);
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/users/{id}/settings", GetHandler)
                .WithTags("Admin")
                .WithSummary("Get settings for a specific user (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<SettingsResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);

            app.MapPut("admin/users/{id}/settings", UpdateHandler)
                .WithTags("Admin")
                .WithSummary("Update or create a setting for a specific user (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<UpdateResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> GetHandler(
            string id,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<SettingsResponse> result = await HandleGetAsync(id, db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? CustomResults.NotFound(failure.Error.Description, failure.Error.Code)
                    : CustomResults.Problem(result));
        }

        private static async Task<IResult> UpdateHandler(
            string id,
            UpdateRequest request,
            UpdateValidator validator,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<UpdateResponse> result = await HandleUpdateAsync(id, request, db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? CustomResults.NotFound(failure.Error.Description, failure.Error.Code)
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<SettingsResponse>> HandleGetAsync(
        string id,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(id, out Guid userId))
            {
                return Result.Failure<SettingsResponse>(
                    Error.Validation("Admin.InvalidUserId", "Invalid user ID format"));
            }

            bool exists = await db.Users.AnyAsync(u => u.Id == userId, cancellationToken);
            if (!exists)
            {
                return Result.Failure<SettingsResponse>(
                    Error.NotFound("Admin.UserNotFound", $"User with id {id} not found"));
            }

            List<UserSetting> settings = await db.UserSettings
                .Where(us => us.UserId == userId)
                .ToListAsync(cancellationToken);

            Dictionary<string, string> dict = settings.ToDictionary(us => us.Key, us => us.Value);

            return Result.Success(new SettingsResponse(dict));
        }
        catch (Exception ex)
        {
            return Result.Failure<SettingsResponse>(
                Error.Problem("Admin.UserSettingsGetFailed", $"Failed to get user settings: {ex.Message}"));
        }
    }

    public static async Task<Result<UpdateResponse>> HandleUpdateAsync(
        string id,
        UpdateRequest request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(id, out Guid userId))
            {
                return Result.Failure<UpdateResponse>(
                    Error.Validation("Admin.InvalidUserId", "Invalid user ID format"));
            }

            bool exists = await db.Users.AnyAsync(u => u.Id == userId, cancellationToken);
            if (!exists)
            {
                return Result.Failure<UpdateResponse>(
                    Error.NotFound("Admin.UserNotFound", $"User with id {id} not found"));
            }

            UserSetting? existing = await db.UserSettings
                .FirstOrDefaultAsync(us => us.UserId == userId && us.Key == request.Key, cancellationToken);

            DateTime updatedAt;
            if (existing is not null)
            {
                existing.Value = request.Value;
                existing.UpdatedAt = DateTime.UtcNow;
                updatedAt = existing.UpdatedAt;
            }
            else
            {
                DateTime now = DateTime.UtcNow;
                UserSetting setting = new()
                {
                    UserId = userId,
                    Key = request.Key,
                    Value = request.Value,
                    CreatedAt = now,
                    UpdatedAt = now
                };
                db.UserSettings.Add(setting);
                updatedAt = setting.UpdatedAt;
            }

            await db.SaveChangesAsync(cancellationToken);

            return Result.Success(new UpdateResponse(request.Key, request.Value, updatedAt));
        }
        catch (Exception ex)
        {
            return Result.Failure<UpdateResponse>(
                Error.Problem("Admin.UserSettingsUpdateFailed", $"Failed to update user setting: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<UpdateValidator>();
        }
    }
}

