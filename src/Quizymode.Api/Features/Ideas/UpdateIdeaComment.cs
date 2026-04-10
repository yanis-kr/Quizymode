using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Ideas;

public static class UpdateIdeaComment
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("ideas/{ideaId:guid}/comments/{commentId:guid}", Handler)
                .WithTags("Ideas")
                .WithSummary("Update an idea comment")
                .RequireAuthorization()
                .Produces<IdeaCommentResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid ideaId,
            Guid commentId,
            IdeaComments.UpdateRequest request,
            IValidator<IdeaComments.UpdateRequest> validator,
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

            Result<IdeaCommentResponse> result = await IdeaComments.HandleUpdateAsync(
                ideaId,
                commentId,
                request,
                db,
                userContext,
                textModerationService,
                auditService,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Code == "IdeaComments.Forbidden"
                    ? Results.Forbid()
                    : failure.Error.Type == ErrorType.NotFound
                        ? Results.NotFound()
                        : CustomResults.Problem(result));
        }
    }
}
