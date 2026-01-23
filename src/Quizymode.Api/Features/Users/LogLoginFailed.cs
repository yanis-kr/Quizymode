using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Users;

public static class LogLoginFailed
{
    public sealed record RequestDto(string? Email);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("auth/login-failed", Handler)
                .WithTags("Auth")
                .WithSummary("Log login failure event")
                .WithDescription("Logs a LoginFailed audit event. Can be called by anonymous users. Email is optional for privacy.")
                .Produces(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            RequestDto? request,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            // Log login failure - userId will be null for anonymous attempts
            await auditService.LogAsync(
                AuditAction.LoginFailed,
                userId: null, // No user ID for failed login
                metadata: request?.Email is not null 
                    ? new Dictionary<string, string> { { "attemptedEmail", request.Email } }
                    : null,
                cancellationToken: cancellationToken);

            return Results.Ok(new { message = "Login failure logged" });
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
