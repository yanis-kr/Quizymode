using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Users;

public static class GetUserById
{
    public sealed record Response(
        string Id,
        string? Name,
        string? Email,
        DateTime CreatedAt,
        DateTime LastLogin);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/users/{id}", Handler)
                .WithTags("Admin")
                .WithSummary("Get a user by their ID")
                .WithDescription("Admin only endpoint to get user details by ID")
                .RequireAuthorization("Admin")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string id,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(id, db, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? CustomResults.NotFound(failure.Error.Description, failure.Error.Code)
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        string id,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!Guid.TryParse(id, out Guid userId))
            {
                return Result.Failure<Response>(
                    Error.Validation("User.InvalidId", "Invalid user ID format"));
            }

            User? user = await db.Users
                .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);

            if (user is null)
            {
                return Result.Failure<Response>(
                    Error.NotFound("User.NotFound", $"User with id {id} not found"));
            }

            Response response = new(
                user.Id.ToString(),
                user.Name,
                user.Email,
                user.CreatedAt,
                user.LastLogin);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Users.GetFailed", $"Failed to get user: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed for this feature.
        }
    }
}

