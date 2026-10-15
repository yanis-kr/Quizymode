using System.Text.RegularExpressions;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using EventFields = Quizymode.Api.Shared.Models.AnalyticsEventCatalog.EventFields;

namespace Quizymode.Api.Features.Analytics;

/// <summary>
/// Records a small batch of allowlisted engagement events (FUNNEL-001). Delivery is best-effort on
/// the client, so the endpoint is idempotent for run-scoped and impression events.
/// </summary>
public static partial class TrackAnalyticsEvents
{
    public const int MaxEventsPerBatch = 25;

    public sealed record Request(string SessionId, List<EventRequest>? Events);

    /// <param name="ClientEventId">
    /// Optional client id for one UI impression or action; repeats within the session are ignored.
    /// </param>
    public sealed record EventRequest(
        string Name,
        string Path,
        string? ContextType = null,
        string? ContextId = null,
        string? ClientEventId = null,
        string? RunId = null,
        Guid? ItemId = null,
        int? Position = null,
        bool? IsCorrect = null,
        int? Score = null,
        int? Total = null);

    public sealed record Response(int Accepted, int Duplicates);

    [GeneratedRegex("^[A-Za-z0-9._:-]+$")]
    private static partial Regex TokenPattern();

    [GeneratedRegex("^[A-Za-z0-9._:/-]+$")]
    private static partial Regex ContextIdPattern();

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.SessionId)
                .NotEmpty()
                .MaximumLength(128);

            RuleFor(x => x.Events)
                .NotNull()
                .Must(events => events is { Count: > 0 and <= MaxEventsPerBatch })
                .WithMessage($"Events must contain between 1 and {MaxEventsPerBatch} items.");

            RuleForEach(x => x.Events).SetValidator(new EventValidator());
        }
    }

    public sealed class EventValidator : AbstractValidator<EventRequest>
    {
        public EventValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty()
                .Must(name => name is not null && AnalyticsEventCatalog.Rules.ContainsKey(name))
                .WithMessage(x => $"Unknown event name '{x.Name}'.");

            RuleFor(x => x.Path)
                .NotEmpty()
                .MaximumLength(512)
                .Must(path => path is not null && path.StartsWith('/') && !path.StartsWith("//", StringComparison.Ordinal))
                .WithMessage("Path must be an app-relative path that starts with '/'.");

            RuleFor(x => x.ContextType)
                .Must(contextType => contextType is null || AnalyticsEventCatalog.ContextTypes.Contains(contextType))
                .WithMessage($"ContextType must be one of: {string.Join(", ", AnalyticsEventCatalog.ContextTypes.Order())}.");

            RuleFor(x => x.ContextId)
                .MaximumLength(128)
                .Must(contextId => contextId is null || ContextIdPattern().IsMatch(contextId))
                .WithMessage("ContextId may contain only letters, digits, and . _ : / -");

            RuleFor(x => x.ContextId)
                .Null()
                .When(x => x.ContextType is null)
                .WithMessage("ContextId requires a ContextType.");

            RuleFor(x => x.ClientEventId)
                .MaximumLength(64)
                .Must(id => id is null || TokenPattern().IsMatch(id))
                .WithMessage("ClientEventId may contain only letters, digits, and . _ : -");

            RuleFor(x => x.RunId)
                .MaximumLength(64)
                .Must(id => id is null || TokenPattern().IsMatch(id))
                .WithMessage("RunId may contain only letters, digits, and . _ : -");

            RuleFor(x => x.Position).InclusiveBetween(1, AnalyticsEventCatalog.MaxScoreOrTotal);
            RuleFor(x => x.Score).InclusiveBetween(0, AnalyticsEventCatalog.MaxScoreOrTotal);
            RuleFor(x => x.Total).InclusiveBetween(1, AnalyticsEventCatalog.MaxScoreOrTotal);

            RuleFor(x => x)
                .Must(x => x.Score is null || x.Total is null || x.Score <= x.Total)
                .WithName("Score")
                .WithMessage("Score cannot exceed Total.");

            RuleFor(x => x)
                .Custom((request, context) =>
                {
                    if (request.Name is null ||
                        !AnalyticsEventCatalog.Rules.TryGetValue(request.Name, out AnalyticsEventCatalog.EventRule? rule))
                    {
                        return;
                    }

                    EventFields present = PresentFields(request);
                    EventFields disallowed = present & ~rule.Allowed;
                    EventFields missing = rule.Required & ~present;

                    if (disallowed != EventFields.None)
                    {
                        context.AddFailure(
                            "Name",
                            $"Event '{request.Name}' does not accept: {disallowed}.");
                    }

                    if (missing != EventFields.None)
                    {
                        context.AddFailure(
                            "Name",
                            $"Event '{request.Name}' requires: {missing}.");
                    }
                });
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("analytics/events", Handler)
                .WithTags("Analytics")
                .WithSummary("Record allowlisted engagement events")
                .WithDescription("Stores up to 25 allowlisted funnel events for an anonymous or authenticated session. Run-scoped events are idempotent per session, event, and run id; events with a clientEventId are idempotent per session, event, and that id. Rate limited.")
                .AllowAnonymous()
                .RequireRateLimiting("analytics-events")
                .Produces<Response>(StatusCodes.Status202Accepted)
                .ProducesValidationProblem()
                .ProducesProblem(StatusCodes.Status429TooManyRequests);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            HttpContext httpContext,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            ValidationResult validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.ValidationProblem(validationResult.ToDictionary());
            }

            Result<Response> result = await HandleAsync(request, httpContext, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Accepted(value: value),
                _ => CustomResults.Problem(result));
        }
    }

    /// <remarks>Assumes <paramref name="request"/> already passed <see cref="Validator"/>.</remarks>
    public static async Task<Result<Response>> HandleAsync(
        Request request,
        HttpContext httpContext,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        string sessionId = request.SessionId.Trim();
        Guid? userId = Guid.TryParse(userContext.UserId, out Guid parsedUserId) ? parsedUserId : null;
        string? userAgent = RequestMetadataHelper.GetUserAgent(httpContext);
        bool isBot = BotUserAgentDetector.IsBot(userAgent);
        DateTime occurredUtc = DateTime.UtcNow;

        List<AnalyticsEvent> candidates = request.Events!
            .Select(item => new AnalyticsEvent
            {
                Id = Guid.NewGuid(),
                EventName = item.Name,
                SessionId = sessionId,
                UserId = userId,
                IsAuthenticated = userContext.IsAuthenticated,
                Path = StripQuery(item.Path),
                ContextType = item.ContextType,
                ContextId = item.ContextId,
                RunId = item.RunId,
                ItemId = item.ItemId,
                Position = item.Position,
                IsCorrect = item.IsCorrect,
                Score = item.Score,
                Total = item.Total,
                DedupeKey = BuildDedupeKey(item),
                UserAgent = userAgent,
                IsBot = isBot,
                OccurredUtc = occurredUtc
            })
            .ToList();

        List<AnalyticsEvent> toInsert = await RemoveDuplicatesAsync(db, sessionId, candidates, cancellationToken);

        if (toInsert.Count > 0)
        {
            db.AnalyticsEvents.AddRange(toInsert);
            try
            {
                // Analytics must not be lost because the caller navigated away mid-request.
                await db.SaveChangesAsync(CancellationToken.None);
            }
            catch (DbUpdateException)
            {
                // A concurrent retry won the unique (SessionId, DedupeKey) race. Re-check and keep the rest.
                db.ChangeTracker.Clear();
                toInsert = await RemoveDuplicatesAsync(db, sessionId, toInsert, CancellationToken.None);
                db.AnalyticsEvents.AddRange(toInsert);
                await db.SaveChangesAsync(CancellationToken.None);
            }
        }

        return Result.Success(new Response(toInsert.Count, candidates.Count - toInsert.Count));
    }

    private static async Task<List<AnalyticsEvent>> RemoveDuplicatesAsync(
        ApplicationDbContext db,
        string sessionId,
        List<AnalyticsEvent> candidates,
        CancellationToken cancellationToken)
    {
        List<string> keys = candidates
            .Where(candidate => candidate.DedupeKey is not null)
            .Select(candidate => candidate.DedupeKey!)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        HashSet<string> seen = keys.Count == 0
            ? new HashSet<string>(StringComparer.Ordinal)
            : (await db.AnalyticsEvents
                .AsNoTracking()
                .Where(existing => existing.SessionId == sessionId && keys.Contains(existing.DedupeKey!))
                .Select(existing => existing.DedupeKey!)
                .ToListAsync(cancellationToken))
                .ToHashSet(StringComparer.Ordinal);

        List<AnalyticsEvent> unique = [];
        foreach (AnalyticsEvent candidate in candidates)
        {
            if (candidate.DedupeKey is null || seen.Add(candidate.DedupeKey))
            {
                unique.Add(candidate);
            }
        }

        return unique;
    }

    /// <summary>
    /// Run-scoped events dedupe on the run id (so a completion can never be stored twice for one
    /// run, whatever the client does); other events dedupe on the optional client event id.
    /// </summary>
    internal static string? BuildDedupeKey(EventRequest item)
    {
        if (item.RunId is not null)
        {
            return item.ItemId is null
                ? $"{item.Name}:run:{item.RunId}"
                : $"{item.Name}:run:{item.RunId}:item:{item.ItemId:N}";
        }

        return item.ClientEventId is null ? null : $"{item.Name}:client:{item.ClientEventId}";
    }

    private static EventFields PresentFields(EventRequest request)
    {
        EventFields fields = EventFields.None;
        if (request.RunId is not null) fields |= EventFields.RunId;
        if (request.Score is not null) fields |= EventFields.Score;
        if (request.Total is not null) fields |= EventFields.Total;
        if (request.ItemId is not null) fields |= EventFields.ItemId;
        if (request.Position is not null) fields |= EventFields.Position;
        if (request.IsCorrect is not null) fields |= EventFields.IsCorrect;
        return fields;
    }

    private static string StripQuery(string path)
    {
        int cut = path.IndexOfAny(['?', '#']);
        return cut < 0 ? path : path[..cut];
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
