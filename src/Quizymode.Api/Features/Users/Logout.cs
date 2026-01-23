using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Users;

public static class Logout
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("auth/logout", Handler)
                .WithTags("Auth")
                .WithSummary("Log user logout event")
                .WithDescription("Logs a logout audit event for the current user. This should be called before the client signs out.")
                .RequireAuthorization()
                .Produces(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> Handler(
            ApplicationDbContext db,
            IUserContext userContext,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            // Allow anonymous users - they can't log out anyway, but we'll log if there's a user ID
            if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
            {
                if (Guid.TryParse(userContext.UserId, out Guid userId))
                {
                    await auditService.LogAsync(
                        AuditAction.Logout,
                        userId: userId,
                        cancellationToken: cancellationToken);
                }
            }

            return Results.Ok(new { message = "Logout logged" });
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No additional services needed
        }
    }
}
