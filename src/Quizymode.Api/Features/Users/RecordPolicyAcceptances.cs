using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Users;

public static class RecordPolicyAcceptances
{
    private static readonly HashSet<string> SupportedPolicyTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        PolicyTypes.TermsOfService,
        PolicyTypes.PrivacyPolicy
    };

    public static class PolicyTypes
    {
        public const string TermsOfService = "TermsOfService";
        public const string PrivacyPolicy = "PrivacyPolicy";
    }

    public sealed record PolicyAcceptanceItem(string PolicyType, string PolicyVersion, DateTime AcceptedAtUtc);

    public sealed record Request(IReadOnlyCollection<PolicyAcceptanceItem> Acceptances);

    public sealed record PolicyAcceptanceResponse(
        string PolicyType,
        string PolicyVersion,
        DateTime AcceptedAtUtc,
        DateTime RecordedAtUtc);

    public sealed record Response(IReadOnlyCollection<PolicyAcceptanceResponse> Acceptances);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Acceptances)
                .NotEmpty()
                .WithMessage("At least one policy acceptance is required")
                .Must(HaveUniquePolicies)
                .WithMessage("Each policy acceptance must be unique per policy type and version");

            RuleForEach(x => x.Acceptances)
                .ChildRules(acceptance =>
                {
                    acceptance.RuleFor(x => x.PolicyType)
                        .NotEmpty()
                        .WithMessage("Policy type is required")
                        .MaximumLength(64)
                        .WithMessage("Policy type must not exceed 64 characters")
                        .Must(policyType => SupportedPolicyTypes.Contains(policyType))
                        .WithMessage("Unsupported policy type");

                    acceptance.RuleFor(x => x.PolicyVersion)
                        .NotEmpty()
                        .WithMessage("Policy version is required")
                        .MaximumLength(64)
                        .WithMessage("Policy version must not exceed 64 characters");

                    acceptance.RuleFor(x => x.AcceptedAtUtc)
                        .NotEqual(default(DateTime))
                        .WithMessage("AcceptedAtUtc is required");
                });
        }

        private static bool HaveUniquePolicies(IReadOnlyCollection<PolicyAcceptanceItem>? acceptances)
        {
            if (acceptances is null)
            {
                return false;
            }

            int uniqueCount = acceptances
                .Select(x => $"{x.PolicyType}:{x.PolicyVersion}")
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Count();

            return uniqueCount == acceptances.Count;
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("users/policy-acceptances", Handler)
                .WithTags("Users")
                .WithSummary("Record policy acceptance(s) for the currently authenticated user")
                .WithDescription("Creates auditable acceptance records keyed by user, policy type, and policy version. Repeating the same acceptance is idempotent.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            HttpContext httpContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(
                request,
                db,
                userContext,
                httpContext,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrEmpty(userContext.UserId))
            {
                return Result.Failure<Response>(
                    Error.Validation("Users.PolicyAcceptance.UserIdMissing", "User ID is missing"));
            }

            if (!Guid.TryParse(userContext.UserId, out Guid userId))
            {
                return Result.Failure<Response>(
                    Error.Validation("Users.PolicyAcceptance.InvalidUserId", "Invalid user ID format"));
            }

            List<PolicyAcceptanceItem> requestedAcceptances = request.Acceptances
                .DistinctBy(x => $"{x.PolicyType}:{x.PolicyVersion}", StringComparer.OrdinalIgnoreCase)
                .ToList();

            HashSet<string> requestedPolicyTypes = requestedAcceptances
                .Select(x => x.PolicyType)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            HashSet<string> requestedPolicyVersions = requestedAcceptances
                .Select(x => x.PolicyVersion)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            List<UserPolicyAcceptance> existingAcceptances = await db.UserPolicyAcceptances
                .Where(x =>
                    x.UserId == userId &&
                    requestedPolicyTypes.Contains(x.PolicyType) &&
                    requestedPolicyVersions.Contains(x.PolicyVersion))
                .ToListAsync(cancellationToken);

            DateTime recordedAtUtc = DateTime.UtcNow;
            string ipAddress = TrimToMaxLength(RequestMetadataHelper.GetClientIpAddress(httpContext), 64, "unknown") ?? "unknown";
            string? userAgent = TrimToMaxLength(httpContext.Request.Headers.UserAgent.ToString(), 512, null);

            foreach (PolicyAcceptanceItem acceptance in requestedAcceptances)
            {
                bool alreadyExists = existingAcceptances.Any(existing =>
                    string.Equals(existing.PolicyType, acceptance.PolicyType, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(existing.PolicyVersion, acceptance.PolicyVersion, StringComparison.OrdinalIgnoreCase));

                if (alreadyExists)
                {
                    continue;
                }

                UserPolicyAcceptance newAcceptance = new()
                {
                    UserId = userId,
                    PolicyType = acceptance.PolicyType,
                    PolicyVersion = acceptance.PolicyVersion,
                    AcceptedAtUtc = acceptance.AcceptedAtUtc,
                    RecordedAtUtc = recordedAtUtc,
                    IpAddress = ipAddress,
                    UserAgent = userAgent
                };

                db.UserPolicyAcceptances.Add(newAcceptance);
                existingAcceptances.Add(newAcceptance);
            }

            await db.SaveChangesAsync(cancellationToken);

            List<PolicyAcceptanceResponse> responseAcceptances = requestedAcceptances
                .Select(requested =>
                {
                    UserPolicyAcceptance storedAcceptance = existingAcceptances.First(existing =>
                        string.Equals(existing.PolicyType, requested.PolicyType, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(existing.PolicyVersion, requested.PolicyVersion, StringComparison.OrdinalIgnoreCase));

                    return new PolicyAcceptanceResponse(
                        storedAcceptance.PolicyType,
                        storedAcceptance.PolicyVersion,
                        storedAcceptance.AcceptedAtUtc,
                        storedAcceptance.RecordedAtUtc);
                })
                .ToList();

            return Result.Success<Response>(new Response(responseAcceptances));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Users.PolicyAcceptance.RecordFailed", $"Failed to record policy acceptance: {ex.Message}"));
        }
    }

    private static string? TrimToMaxLength(string? value, int maxLength, string? fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return fallback;
        }

        string trimmed = value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
