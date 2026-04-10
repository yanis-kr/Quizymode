using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Options;
using Microsoft.Extensions.Options;

namespace Quizymode.Api.Features.Ideas;

public static class CreateIdea
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("ideas", Handler)
                .WithTags("Ideas")
                .WithSummary("Create a new idea submission")
                .WithDescription("Creates a new idea in PendingReview moderation state for the authenticated user.")
                .RequireAuthorization()
                .RequireRateLimiting("ideas-create")
                .Produces<IdeaSummaryResponse>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status409Conflict)
                .Produces(StatusCodes.Status429TooManyRequests);
        }

        private static async Task<IResult> Handler(
            IdeaCrud.CreateRequest request,
            IValidator<IdeaCrud.CreateRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ITurnstileVerificationService turnstileVerificationService,
            ITextModerationService textModerationService,
            IAuditService auditService,
            IOptions<IdeaAbuseProtectionOptions> abuseOptions,
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

            Result<IdeaSummaryResponse> result = await IdeaCrud.HandleCreateAsync(
                request,
                db,
                userContext,
                turnstileVerificationService,
                textModerationService,
                auditService,
                abuseOptions.Value,
                httpContext,
                cancellationToken);

            return result.Match(
                value => Results.Created($"/api/ideas/{value.Id}", value),
                _ => CustomResults.Problem(result));
        }
    }
}
