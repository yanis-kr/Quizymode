using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Ideas;

public static class CreateIdeaComment
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("ideas/{ideaId:guid}/comments", Handler)
                .WithTags("Ideas")
                .WithSummary("Create a comment on a published idea")
                .RequireAuthorization()
                .RequireRateLimiting("ideas-comments")
                .Produces<IdeaCommentResponse>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status429TooManyRequests);
        }

        private static async Task<IResult> Handler(
            Guid ideaId,
            IdeaComments.CreateRequest request,
            IValidator<IdeaComments.CreateRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ITextModerationService textModerationService,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrWhiteSpace(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            FluentValidation.Results.ValidationResult validationResult =
                await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<IdeaCommentResponse> result = await IdeaComments.HandleCreateAsync(
                ideaId,
                request,
                db,
                userContext,
                textModerationService,
                auditService,
                cancellationToken);

            return result.Match(
                value => Results.Created($"/api/ideas/{ideaId}/comments/{value.Id}", value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }
}
