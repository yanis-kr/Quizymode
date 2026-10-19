using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Users;

/// <summary>
/// Tells the signed-in user's SPA whether they still need to accept the current Terms of Service or Privacy Policy
/// (#222). A policy needs acceptance when the user has no acceptance row for its current version.
/// </summary>
public static class GetPolicyAcceptanceStatus
{
    public sealed record PolicyStatus(
        string PolicyType,
        string CurrentVersion,
        string? AcceptedVersion,
        bool NeedsAcceptance);

    public sealed record Response(IReadOnlyCollection<PolicyStatus> Policies, bool NeedsAcceptance);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("users/policy-acceptances/status", Handler)
                .WithTags("Users")
                .WithSummary("Get whether the current user has accepted the current policies")
                .WithDescription("For each supported policy, returns the current version, the latest version the user accepted (or null), and whether the user must accept the current version.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> Handler(
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
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

    public static async Task<Result<Response>> HandleAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(userContext.UserId, out Guid userId))
        {
            return Result.Failure<Response>(
                Error.Validation("Users.PolicyAcceptance.InvalidUserId", "Invalid user ID format"));
        }

        var accepted = await db.UserPolicyAcceptances
            .AsNoTracking()
            .Where(x => x.UserId == userId)
            .Select(x => new { x.PolicyType, x.PolicyVersion, x.AcceptedAtUtc })
            .ToListAsync(cancellationToken);

        List<PolicyStatus> policies = CurrentPolicyVersions.All
            .Select(policy =>
            {
                var forType = accepted
                    .Where(x => string.Equals(x.PolicyType, policy.PolicyType, StringComparison.OrdinalIgnoreCase))
                    .ToList();
                bool acceptedCurrent = forType.Any(x =>
                    string.Equals(x.PolicyVersion, policy.Version, StringComparison.OrdinalIgnoreCase));
                // Versions are ISO dates, so the ordinal maximum is the newest version accepted.
                string? latestAccepted = acceptedCurrent
                    ? policy.Version
                    : forType.Select(x => x.PolicyVersion).OrderByDescending(v => v, StringComparer.Ordinal).FirstOrDefault();

                return new PolicyStatus(policy.PolicyType, policy.Version, latestAccepted, !acceptedCurrent);
            })
            .ToList();

        return Result.Success(new Response(policies, policies.Any(p => p.NeedsAcceptance)));
    }
}
