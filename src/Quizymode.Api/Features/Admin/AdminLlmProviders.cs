using System.Text.RegularExpressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Features.StudyGuideDocuments;
using Quizymode.Api.Features.StudyGuideDocuments.Generation;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.Admin;

/// <summary>
/// Admin: AI providers (AC 5.12). Choose the model per vendor and the ordered vendor fallback route per tier, see whether
/// each vendor's API key is configured (keys themselves come only from configuration and are never returned), the global
/// monthly section budget, and recent vendor attempts.
/// </summary>
public static partial class AdminLlmProviders
{
    public const int MaxAttempts = 200;

    public sealed record VendorResponse(string Vendor, bool KeyConfigured, string Model);

    public sealed record Routes(List<string> Free, List<string> Premium);

    public sealed record Response(List<VendorResponse> Vendors, Routes Routes, int MonthlySectionBudget, int MonthlySectionsUsed);

    public sealed record VendorModel(string Vendor, string Model);

    public sealed record UpdateRequest(List<VendorModel>? Vendors, Routes? Routes);

    public sealed record AttemptResponse(
        DateTime CreatedUtc,
        string Vendor,
        string Model,
        string Outcome,
        int? InputTokens,
        int? OutputTokens,
        int DurationMs);

    public sealed record AttemptsResponse(List<AttemptResponse> Attempts);

    public sealed class UpdateValidator : AbstractValidator<UpdateRequest>
    {
        public UpdateValidator()
        {
            RuleFor(x => x.Vendors)
                .NotNull()
                .WithMessage("Vendors are required.")
                .Must(vendors => vendors is null ||
                    vendors.Select(vendor => LlmVendors.Normalize(vendor.Vendor)).Distinct().Count() == vendors.Count)
                .WithMessage("Each vendor may appear only once.");

            RuleForEach(x => x.Vendors).ChildRules(vendor =>
            {
                vendor.RuleFor(v => v.Vendor)
                    .Must(name => LlmVendors.Normalize(name) is not null)
                    .WithMessage($"Vendor must be one of: {string.Join(", ", LlmVendors.All)}.");
                vendor.RuleFor(v => v.Model)
                    .NotEmpty()
                    .WithMessage("Model is required.")
                    .MaximumLength(100)
                    .WithMessage("Model must not exceed 100 characters.")
                    .Matches(ModelRegex())
                    .WithMessage("Model may contain only letters, digits, '.', '_', ':', '-', and '/'.");
            });

            RuleFor(x => x.Routes)
                .NotNull()
                .WithMessage("Routes are required.");

            RuleFor(x => x.Routes!.Free)
                .Must(IsValidRoute)
                .WithMessage("The free route must list 1 to 3 distinct known vendors.")
                .When(x => x.Routes is not null);

            RuleFor(x => x.Routes!.Premium)
                .Must(IsValidRoute)
                .WithMessage("The premium route must list 1 to 3 distinct known vendors.")
                .When(x => x.Routes is not null);
        }

        private static bool IsValidRoute(List<string>? route) =>
            route is { Count: >= 1 and <= 3 } &&
            route.All(vendor => LlmVendors.Normalize(vendor) is not null) &&
            route.Select(LlmVendors.Normalize).Distinct().Count() == route.Count;
    }

    [GeneratedRegex(@"^[A-Za-z0-9._:\-/]+$")]
    private static partial Regex ModelRegex();

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/llm-providers", GetHandler)
                .WithTags("Admin")
                .WithSummary("Get LLM vendor models, routes, key status, and the monthly section budget (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden);

            app.MapPut("admin/llm-providers", UpdateHandler)
                .WithTags("Admin")
                .WithSummary("Update LLM vendor models and per-tier routes (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden);

            app.MapGet("admin/llm-providers/attempts", AttemptsHandler)
                .WithTags("Admin")
                .WithSummary("List recent LLM vendor attempts, newest first, at most 200 (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<AttemptsResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden);
        }

        private static async Task<IResult> GetHandler(
            ApplicationDbContext db,
            ILlmVendorRegistry vendors,
            IOptions<StudyGuideGenerationOptions> options,
            TimeProvider timeProvider,
            CancellationToken cancellationToken) =>
            Results.Ok(await HandleGetAsync(db, vendors, options.Value, timeProvider.GetUtcNow().UtcDateTime, cancellationToken));

        private static async Task<IResult> UpdateHandler(
            UpdateRequest request,
            IValidator<UpdateRequest> validator,
            ApplicationDbContext db,
            ILlmVendorRegistry vendors,
            IOptions<StudyGuideGenerationOptions> options,
            TimeProvider timeProvider,
            CancellationToken cancellationToken)
        {
            FluentValidation.Results.ValidationResult validation = await validator.ValidateAsync(request, cancellationToken);
            if (!validation.IsValid)
            {
                return Results.BadRequest(validation.Errors);
            }

            return Results.Ok(await HandleUpdateAsync(request, db, vendors, options.Value, timeProvider.GetUtcNow().UtcDateTime, cancellationToken));
        }

        private static async Task<IResult> AttemptsHandler(
            int? days,
            ApplicationDbContext db,
            TimeProvider timeProvider,
            CancellationToken cancellationToken) =>
            Results.Ok(await HandleAttemptsAsync(days, db, timeProvider.GetUtcNow().UtcDateTime, cancellationToken));
    }

    internal static async Task<Response> HandleGetAsync(
        ApplicationDbContext db,
        ILlmVendorRegistry vendors,
        StudyGuideGenerationOptions options,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        LlmProviderSettings settings = await LlmProviderSettingsStore.GetOrCreateAsync(db, cancellationToken);
        int used = await StudyGuideQuota.GlobalMonthlyUsedAsync(db, nowUtc, cancellationToken);
        return ToResponse(settings, vendors, options.MonthlySectionBudget, used);
    }

    internal static async Task<Response> HandleUpdateAsync(
        UpdateRequest request,
        ApplicationDbContext db,
        ILlmVendorRegistry vendors,
        StudyGuideGenerationOptions options,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        LlmProviderSettings settings = await LlmProviderSettingsStore.GetOrCreateAsync(db, cancellationToken);
        foreach (VendorModel vendor in request.Vendors ?? [])
        {
            string? name = LlmVendors.Normalize(vendor.Vendor);
            if (name is not null)
            {
                LlmProviderSettingsStore.SetModel(settings, name, vendor.Model.Trim());
            }
        }

        if (request.Routes is not null)
        {
            settings.RouteFree = LlmProviderSettingsStore.FormatRoute(LlmProviderSettingsStore.ParseRoute(string.Join(",", request.Routes.Free)));
            settings.RoutePremium = LlmProviderSettingsStore.FormatRoute(LlmProviderSettingsStore.ParseRoute(string.Join(",", request.Routes.Premium)));
        }

        settings.UpdatedUtc = nowUtc;
        await db.SaveChangesAsync(cancellationToken);

        int used = await StudyGuideQuota.GlobalMonthlyUsedAsync(db, nowUtc, cancellationToken);
        return ToResponse(settings, vendors, options.MonthlySectionBudget, used);
    }

    internal static async Task<AttemptsResponse> HandleAttemptsAsync(
        int? days,
        ApplicationDbContext db,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        DateTime since = nowUtc.AddDays(-Math.Clamp(days ?? 7, 1, 90));
        List<LlmAttempt> attempts = await db.LlmAttempts
            .AsNoTracking()
            .Where(attempt => attempt.CreatedUtc >= since)
            .OrderByDescending(attempt => attempt.CreatedUtc)
            .Take(MaxAttempts)
            .ToListAsync(cancellationToken);

        return new AttemptsResponse(attempts
            .Select(attempt => new AttemptResponse(
                attempt.CreatedUtc,
                attempt.Vendor,
                attempt.Model,
                attempt.Outcome.ToString(),
                attempt.InputTokens,
                attempt.OutputTokens,
                attempt.DurationMs))
            .ToList());
    }

    private static Response ToResponse(LlmProviderSettings settings, ILlmVendorRegistry vendors, int budget, int used) =>
        new(
            LlmVendors.All
                .Select(vendor => new VendorResponse(vendor, vendors.IsConfigured(vendor), LlmProviderSettingsStore.ModelFor(settings, vendor)))
                .ToList(),
            new Routes(
                LlmProviderSettingsStore.RouteFor(settings, StudyGuideTier.Free),
                LlmProviderSettingsStore.RouteFor(settings, StudyGuideTier.Premium)),
            budget,
            used);

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<UpdateRequest>, UpdateValidator>();
        }
    }
}
