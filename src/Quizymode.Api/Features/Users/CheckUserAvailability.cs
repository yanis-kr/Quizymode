using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;

namespace Quizymode.Api.Features.Users;

public static class CheckUserAvailability
{
    public sealed record CheckUserAvailabilityResponse(bool IsUsernameAvailable, string? UsernameError);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            // Anonymous, so it answers about display names only: never whether an email address is registered.
            app.MapGet("users/availability", Handler)
                .WithTags("Users")
                .WithSummary("Check if a display name is available")
                .WithDescription("Checks whether a display name is already in use. Rate limited per client.")
                .RequireRateLimiting("username-availability")
                .Produces<CheckUserAvailabilityResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status429TooManyRequests);
        }

        private static async Task<IResult> Handler(
            string? username,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(username))
            {
                return CustomResults.BadRequest("A username must be provided");
            }

            string wanted = username.Trim().ToLower();

            // A stored name can be an email address (a sign-in without a name claim), so a value shaped like one is
            // not looked up. A duplicate display name is still made unique when the account is created.
            bool isTaken = !wanted.Contains('@')
                && await db.Users.AnyAsync(u => u.Name != null && u.Name.ToLower() == wanted, cancellationToken);

            return Results.Ok(new CheckUserAvailabilityResponse(
                !isTaken,
                isTaken ? "Username is already registered" : null));
        }
    }
}
