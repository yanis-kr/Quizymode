using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudySessions;

/// <summary>
/// CONV-003 (#115): imports browser-local guest history into the signed-in user's history as
/// <c>guest-import</c> (unverified) sessions. Versioned payload; idempotent per run ID so retries and
/// repeated imports never duplicate or overwrite.
/// </summary>
public static class ImportGuestStudySessions
{
    public const int SupportedVersion = 1;
    public const int MaxRuns = 50;

    public sealed record Request(int Version, List<RecordStudySession.Request>? Runs);

    /// <param name="Imported">Runs newly stored.</param>
    /// <param name="Duplicates">Runs already stored for this account (kept as-is).</param>
    /// <param name="RejectedRunIds">Runs that failed validation and can never be accepted; safe to discard.</param>
    public sealed record Response(int Imported, int Duplicates, List<string> RejectedRunIds);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Version).Equal(SupportedVersion).WithMessage("Unsupported guest import version");
            RuleFor(x => x.Runs).NotNull().Must(r => r is { Count: >= 1 and <= MaxRuns })
                .WithMessage("Runs must contain between 1 and 50 entries");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("study-sessions/import", Handler)
                .WithTags("StudySessions")
                .WithSummary("Import browser-local guest quiz history into the current user's history")
                .WithDescription("Version 1 payload of up to 50 runs. Idempotent by run ID; imported sessions have origin guest-import (unverified). Requires authentication.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            IValidator<RecordStudySession.Request> runValidator,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            var validation = await validator.ValidateAsync(request, cancellationToken);
            if (!validation.IsValid)
            {
                string errors = string.Join("; ", validation.Errors.Select(e => e.ErrorMessage));
                return CustomResults.BadRequest(errors, "Validation failed");
            }

            Result<Response> result = await HandleAsync(request, runValidator, db, userContext.UserId, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        IValidator<RecordStudySession.Request> runValidator,
        ApplicationDbContext db,
        string userId,
        CancellationToken cancellationToken)
    {
        int imported = 0;
        int duplicates = 0;
        List<string> rejected = new();
        HashSet<string> seen = new(StringComparer.Ordinal);

        foreach (RecordStudySession.Request run in request.Runs ?? new List<RecordStudySession.Request>())
        {
            if (run is null || !seen.Add(run.RunId ?? string.Empty))
            {
                // A repeated run ID inside one payload counts as a duplicate of the first occurrence.
                if (run is not null) duplicates++;
                continue;
            }

            var validation = await runValidator.ValidateAsync(run, cancellationToken);
            if (!validation.IsValid)
            {
                rejected.Add(run.RunId ?? string.Empty);
                continue;
            }

            Result<RecordStudySession.Response> result = await RecordStudySession.HandleAsync(
                run, StudySessionOrigins.GuestImport, db, userId, cancellationToken);
            if (result.IsFailure)
            {
                // Storage failure: report the whole import as failed so the client keeps its guest data and retries.
                return Result.Failure<Response>(result.Error);
            }

            if (result.Value.Created) imported++;
            else duplicates++;
        }

        return Result.Success(new Response(imported, duplicates, rejected));
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
