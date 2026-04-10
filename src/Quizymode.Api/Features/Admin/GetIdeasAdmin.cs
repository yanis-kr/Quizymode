using Quizymode.Api.Data;
using Quizymode.Api.Features.Ideas;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Admin;

public static class GetIdeasAdmin
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/ideas", Handler)
                .WithTags("Admin")
                .WithSummary("Get ideas for moderation review")
                .RequireAuthorization("Admin")
                .Produces<IdeaBoardResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string? moderationState,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result<IdeaBoardResponse> result = await IdeasAdmin.HandleListAsync(
                moderationState,
                db,
                userContext,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }
    }
}
