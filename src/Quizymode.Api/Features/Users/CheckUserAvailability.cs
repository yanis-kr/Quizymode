using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;

namespace Quizymode.Api.Features.Users;

public static class CheckUserAvailability
{
    public sealed record CheckUserAvailabilityRequest(string? Username, string? Email);

    public sealed record CheckUserAvailabilityResponse(bool IsUsernameAvailable, bool IsEmailAvailable, string? UsernameError, string? EmailError);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("users/availability", Handler)
                .WithTags("Users")
                .WithSummary("Check if username and/or email are available")
                .WithDescription("Checks if the provided username and/or email are already registered. Returns availability status for each.")
                .Produces<CheckUserAvailabilityResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string? username,
            string? email,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(username) && string.IsNullOrWhiteSpace(email))
            {
                return CustomResults.BadRequest("At least one of username or email must be provided");
            }

            bool isUsernameAvailable = true;
            bool isEmailAvailable = true;
            string? usernameError = null;
            string? emailError = null;

            // Check username availability
            if (!string.IsNullOrWhiteSpace(username))
            {
                bool usernameExists = await db.Users
                    .AnyAsync(u => u.Name != null && u.Name.ToLower() == username.Trim().ToLower(), cancellationToken);
                
                if (usernameExists)
                {
                    isUsernameAvailable = false;
                    usernameError = "Username is already registered";
                }
            }

            // Check email availability
            if (!string.IsNullOrWhiteSpace(email))
            {
                bool emailExists = await db.Users
                    .AnyAsync(u => u.Email != null && u.Email.ToLower() == email.Trim().ToLower(), cancellationToken);
                
                if (emailExists)
                {
                    isEmailAvailable = false;
                    emailError = "Email is already registered";
                }
            }

            CheckUserAvailabilityResponse response = new(
                isUsernameAvailable,
                isEmailAvailable,
                usernameError,
                emailError);

            return Results.Ok(response);
        }
    }
}

