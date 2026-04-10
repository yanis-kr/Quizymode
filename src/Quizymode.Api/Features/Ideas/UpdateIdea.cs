using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Ideas;

public static class UpdateIdea
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("ideas/{id:guid}", Handler)
                .WithTags("Ideas")
                .WithSummary("Update an idea")
                .RequireAuthorization()
                .Produces<IdeaSummaryResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status409Conflict);
        }

        private static async Task<IResult> Handler(
            Guid id,
            IdeaCrud.UpdateRequest request,
            IValidator<IdeaCrud.UpdateRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ITextModerationService textModerationService,
            IAuditService auditService,
            HttpContext httpContext,
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

            Result<IdeaSummaryResponse> result = await IdeaCrud.HandleUpdateAsync(
                id,
                request,
                db,
                userContext,
                textModerationService,
                auditService,
                httpContext,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Code == "Ideas.Forbidden"
                    ? Results.Forbid()
                    : failure.Error.Type == ErrorType.NotFound
                        ? Results.NotFound()
                        : CustomResults.Problem(result));
        }
    }
}
