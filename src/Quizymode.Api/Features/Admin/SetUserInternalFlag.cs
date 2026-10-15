using FluentValidation;
using FluentValidation.Results;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

/// <summary>
/// Lets an admin mark a staff or test account as internal so its traffic drops out of analytics.
/// Reports join the flag at query time, so the change applies to the user's past sessions too.
/// </summary>
public static class SetUserInternalFlag
{
    public sealed record Request(bool? IsInternal);

    public sealed record Response(string Id, bool IsInternal);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.IsInternal)
                .NotNull()
                .WithMessage("IsInternal is required.");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("admin/users/{id}/internal", Handler)
                .WithTags("Admin")
                .WithSummary("Flag or unflag a user as internal traffic (Admin only)")
                .WithDescription("Internal users' sessions, including earlier ones, are excluded from admin analytics reports unless includeInternal=true.")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .ProducesProblem(StatusCodes.Status400BadRequest)
                .ProducesProblem(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string id,
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            ValidationResult validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return CustomResults.BadRequest(validationResult.Errors[0].ErrorMessage);
            }

            Result<Response> result = await HandleAsync(id, request, db, userContext, auditService, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? CustomResults.NotFound(failure.Error.Description, failure.Error.Code)
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        string id,
        Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(id, out Guid userId))
        {
            return Result.Failure<Response>(
                Error.Validation("Admin.InvalidUserId", "Invalid user ID format."));
        }

        User? user = await db.Users.FirstOrDefaultAsync(candidate => candidate.Id == userId, cancellationToken);
        if (user is null)
        {
            return Result.Failure<Response>(
                Error.NotFound("Admin.UserNotFound", $"User with id {id} not found."));
        }

        bool isInternal = request.IsInternal ?? false;
        if (user.IsInternal != isInternal)
        {
            user.IsInternal = isInternal;
            await db.SaveChangesAsync(cancellationToken);

            Guid? adminUserId = Guid.TryParse(userContext.UserId, out Guid parsedAdminId) ? parsedAdminId : null;
            await auditService.LogAsync(
                AuditAction.UserInternalFlagChanged,
                adminUserId,
                user.Id,
                new Dictionary<string, string> { ["isInternal"] = isInternal ? "true" : "false" },
                cancellationToken);
        }

        return Result.Success(new Response(user.Id.ToString(), user.IsInternal));
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
