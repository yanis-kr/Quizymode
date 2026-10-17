using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Ideas;

public static class GetIdeasBoard
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("ideas", Handler)
                .WithTags("Ideas")
                .WithSummary("Get the public ideas board")
                .WithDescription("Returns a page of published ideas with rating and comment summaries (page defaults to 1, pageSize to 50, max 100).")
                .Produces<IdeaBoardResponse>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            int? page,
            int? pageSize,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result<IdeaBoardResponse> result =
                await IdeaBoard.HandlePublicAsync(db, userContext, cancellationToken, page, pageSize);

            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }
    }
}
