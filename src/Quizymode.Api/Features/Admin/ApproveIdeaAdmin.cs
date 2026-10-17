using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Ideas;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Admin;

public static class ApproveIdeaAdmin
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("admin/ideas/{id:guid}/approve", Handler)
                .WithTags("Admin")
                .WithSummary("Approve an idea for publication")
                .RequireAuthorization("Admin")
                .Produces<IdeaSummaryResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            IdeasAdmin.ApproveRequest? request,
            IValidator<IdeasAdmin.ApproveRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            if (request is not null)
            {
                FluentValidation.Results.ValidationResult validationResult =
                    await validator.ValidateAsync(request, cancellationToken);
                if (!validationResult.IsValid)
                {
                    return Results.BadRequest(validationResult.Errors);
                }
            }

            Result<IdeaSummaryResponse> result = await IdeasAdmin.HandleApproveAsync(
                id,
                db,
                userContext,
                auditService,
                cancellationToken,
                request?.ModerationNotes);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }
}
