using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Ideas;

public static class UpdateIdeaStatus
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("ideas/{id:guid}/status", Handler)
                .WithTags("Ideas")
                .WithSummary("Update an idea lifecycle status")
                .RequireAuthorization("Admin")
                .Produces<IdeaSummaryResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            IdeaCrud.StatusRequest request,
            IValidator<IdeaCrud.StatusRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            FluentValidation.Results.ValidationResult validationResult =
                await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<IdeaSummaryResponse> result = await IdeaCrud.HandleStatusUpdateAsync(
                id,
                request,
                db,
                userContext,
                auditService,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }
}
