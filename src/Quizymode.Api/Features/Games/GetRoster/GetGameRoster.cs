using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Mvc;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Games.GetRoster;

/// <summary>
/// GET /games/roster (#381): items for the Games hub with the short-text eligibility prefilter applied in SQL
/// before random sampling, so sparse scopes still surface their playable items.
/// </summary>
public static class GetGameRoster
{
    public const int MaxScopes = 10;
    public const int MaxLimit = 200;
    public const int DefaultLimit = 200;
    public const int MaxSegments = 3;
    public const int MaxSegmentLength = 100;

    public const string StatusOk = "ok";
    public const string StatusEmpty = "empty";

    /// <summary>Scope tokens are <c>category[/l1[/l2]]</c>; no tokens means every category.</summary>
    public sealed record Request(string[]? Scope, int? Limit);

    /// <summary>One requested scope: its eligible count, how many of those made it into the roster, and ok/empty status.</summary>
    public sealed record ScopeResult(string Scope, int Available, int Returned, string Status);

    public sealed record Response(List<GetItems.ItemResponse> Items, List<ScopeResult> Scopes);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(request => request.Scope)
                .Must(scopes => scopes is null || scopes.Length <= MaxScopes)
                .WithMessage($"At most {MaxScopes} scopes are allowed.");

            RuleFor(request => request.Scope)
                .Must(scopes => scopes is null || scopes.All(IsValidToken))
                .WithMessage(
                    $"Each scope must be category[/l1[/l2]] with 1 to {MaxSegments} non-empty segments of at most {MaxSegmentLength} characters.");

            RuleFor(request => request.Limit)
                .InclusiveBetween(1, MaxLimit)
                .When(request => request.Limit.HasValue)
                .WithMessage($"limit must be between 1 and {MaxLimit}.");
        }

        private static bool IsValidToken(string? token)
        {
            if (token is null)
            {
                return false;
            }

            string[] segments = token.Split('/');
            return segments.Length <= MaxSegments
                && segments.All(segment => segment.Trim().Length is > 0 and <= MaxSegmentLength);
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("games/roster", Handler)
                .WithTags("Games")
                .WithSummary("Get a random roster of game-eligible items for one or more scopes")
                .WithDescription(
                    "Each `scope` is `category[/l1[/l2]]` (up to 10; none means every category). Items are filtered to the Games " +
                    "short-text rule in SQL before random sampling, then merged round-robin across scopes up to `limit`. " +
                    "Public items plus the caller's own when signed in. Unknown scopes report status `empty`.")
                .AllowAnonymous()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces<ProblemDetails>(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string[]? scope,
            int? limit,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Request request = new(scope, limit);
            ValidationResult validation = new Validator().Validate(request);
            if (!validation.IsValid)
            {
                Result invalid = Result.Failure(Error.Validation("Games.InvalidRoster", validation.Errors[0].ErrorMessage));
                return CustomResults.Problem(invalid);
            }

            Result<Response> result = await GetGameRosterHandler.HandleAsync(request, db, userContext, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed for this feature
        }
    }
}
