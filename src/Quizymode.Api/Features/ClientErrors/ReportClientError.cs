using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.ClientErrors;

/// <summary>
/// Records one front-end error from the SPA (OBS-001). The endpoint is anonymous, rate limited, and
/// accepts a JSON body sent as <c>application/json</c> or as <c>text/plain</c> (what
/// <c>navigator.sendBeacon</c> sends without a CORS preflight). Every text field is sanitized and
/// truncated rather than rejected; a body over <see cref="MaxBodyBytes"/> is refused outright.
/// </summary>
public static partial class ReportClientError
{
    public const int MaxBodyBytes = 32 * 1024;

    /// <summary>Server-side backstop for the client's per-tab limit.</summary>
    public const int MaxReportsPerSession = 10;

    public const string SourceBoundary = "boundary";
    public const string SourceWindow = "window";
    public const string SourcePromise = "promise";

    public static readonly IReadOnlySet<string> Sources = new HashSet<string>(StringComparer.Ordinal)
    {
        SourceBoundary,
        SourceWindow,
        SourcePromise
    };

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <param name="InternalBrowser">
    /// Client-asserted internal-browser marker, as on page views (#121); it can only remove the sender's own errors from reports.
    /// </param>
    public sealed record Request(
        string? Source,
        string? Message,
        string? Name = null,
        string? Stack = null,
        string? ComponentStack = null,
        string? Path = null,
        string? AppVersion = null,
        string? SessionId = null,
        string? VisitorId = null,
        bool? InternalBrowser = null);

    /// <param name="Stored">False when the same error was already stored for this session, or the session hit its limit.</param>
    /// <param name="Reason"><c>duplicate</c> or <c>session_limit</c> when not stored.</param>
    /// <param name="Fingerprint">The report's 32-hex-character grouping key.</param>
    public sealed record Response(bool Stored, string? Reason, string Fingerprint);

    [GeneratedRegex("^[A-Za-z0-9._:-]+$")]
    private static partial Regex TokenPattern();

    [GeneratedRegex("^[0-9A-Za-z.+-]+$")]
    private static partial Regex VersionPattern();

    /// <summary>A URL: drops userinfo, query string, and fragment, keeps a trailing <c>:line:col</c>.</summary>
    [GeneratedRegex("""(?<scheme>[A-Za-z][A-Za-z0-9+.\-]*://)(?:[^\s/@?#]*@)?(?<rest>[^\s?#()'"<>]*)(?:[?#][^\s()'"<>]*?)?(?<pos>(?::\d+){1,2})?(?=[\s()'"<>]|$)""")]
    private static partial Regex UrlPattern();

    [GeneratedRegex(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")]
    private static partial Regex EmailPattern();

    [GeneratedRegex(@"eyJ[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]*")]
    private static partial Regex JwtPattern();

    [GeneratedRegex(@"(?i)\bbearer\s+[A-Za-z0-9._~+/=\-]+")]
    private static partial Regex BearerPattern();

    [GeneratedRegex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")]
    private static partial Regex GuidPattern();

    [GeneratedRegex(@"\b[0-9a-fA-F]{8,}\b")]
    private static partial Regex HexPattern();

    [GeneratedRegex(@"\d+")]
    private static partial Regex DigitsPattern();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespacePattern();

    [GeneratedRegex(@"(?::\d+){1,2}(?=\)?\s*$)")]
    private static partial Regex LineColumnPattern();

    /// <summary>Vite/Rollup content hashes in bundle file names, e.g. <c>index-BvA9x2_q.js</c>.</summary>
    [GeneratedRegex(@"[-.][A-Za-z0-9_\-]{8}(?=\.m?js\b)")]
    private static partial Regex BundleHashPattern();

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Source)
                .NotEmpty()
                .Must(source => source is not null && Sources.Contains(source))
                .WithMessage("Source must be one of: boundary, window, promise.");

            RuleFor(x => x.Message)
                .Must(message => !string.IsNullOrWhiteSpace(message))
                .WithMessage("Message is required.");

            RuleFor(x => x.Path)
                .NotEmpty()
                .Must(path => path is not null && path.StartsWith('/') && !path.StartsWith("//", StringComparison.Ordinal))
                .WithMessage("Path must be an app-relative path that starts with '/'.");

            RuleFor(x => x.SessionId)
                .NotEmpty()
                .MaximumLength(128)
                .Must(id => id is null || TokenPattern().IsMatch(id.Trim()))
                .WithMessage("SessionId may contain only letters, digits, and . _ : -");

            RuleFor(x => x.VisitorId)
                .MaximumLength(128)
                .Must(id => id is null || TokenPattern().IsMatch(id))
                .WithMessage("VisitorId may contain only letters, digits, and . _ : -");

            RuleFor(x => x.AppVersion)
                .MaximumLength(32)
                .Must(version => version is null || VersionPattern().IsMatch(version))
                .WithMessage("AppVersion may contain only letters, digits, and . + -");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("client-errors", Handler)
                .WithTags("Observability")
                .WithSummary("Report a front-end error")
                .WithDescription("Stores one sanitized, bounded SPA error report for an anonymous or authenticated session and writes a structured warning log with its fingerprint and app version. Accepts a JSON body as application/json or text/plain (navigator.sendBeacon). Text fields are truncated, never rejected for length; query strings, fragments, emails and tokens are removed. The same fingerprint is stored at most once per session and at most 10 reports per session. Rate limited.")
                .AllowAnonymous()
                .RequireRateLimiting("client-errors")
                .Accepts<Request>("application/json", "text/plain")
                .Produces<Response>(StatusCodes.Status202Accepted)
                .ProducesValidationProblem()
                .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
                .ProducesProblem(StatusCodes.Status429TooManyRequests);
        }

        private static async Task<IResult> Handler(
            HttpContext httpContext,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ILoggerFactory loggerFactory,
            CancellationToken cancellationToken)
        {
            (Request? request, IResult? readError) = await ReadRequestAsync(httpContext.Request, cancellationToken);
            if (readError is not null)
            {
                return readError;
            }

            ValidationResult validationResult = await validator.ValidateAsync(request!, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.ValidationProblem(validationResult.ToDictionary());
            }

            ILogger logger = loggerFactory.CreateLogger(typeof(ReportClientError).FullName!);
            Response response = await HandleAsync(request!, httpContext, db, userContext, logger, cancellationToken);
            return Results.Accepted(value: response);
        }
    }

    internal static async Task<(Request? Request, IResult? Error)> ReadRequestAsync(
        HttpRequest httpRequest,
        CancellationToken cancellationToken)
    {
        if (httpRequest.ContentLength > MaxBodyBytes)
        {
            return (null, TooLarge());
        }

        using MemoryStream buffer = new();
        byte[] chunk = new byte[8192];
        int read;
        while ((read = await httpRequest.Body.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > MaxBodyBytes)
            {
                return (null, TooLarge());
            }

            buffer.Write(chunk, 0, read);
        }

        if (buffer.Length == 0)
        {
            return (null, InvalidBody("A JSON body is required."));
        }

        try
        {
            Request? request = JsonSerializer.Deserialize<Request>(buffer.ToArray(), JsonOptions);
            return request is null ? (null, InvalidBody("A JSON object is required.")) : (request, null);
        }
        catch (JsonException)
        {
            return (null, InvalidBody("The body is not valid JSON for a client error report."));
        }

        static IResult TooLarge() => Results.Problem(
            title: "Payload Too Large",
            detail: $"Client error reports must be {MaxBodyBytes} bytes or fewer.",
            statusCode: StatusCodes.Status413PayloadTooLarge);

        static IResult InvalidBody(string message) => Results.ValidationProblem(
            new Dictionary<string, string[]> { ["body"] = [message] });
    }

    /// <remarks>Assumes <paramref name="request"/> already passed <see cref="Validator"/>.</remarks>
    public static async Task<Response> HandleAsync(
        Request request,
        HttpContext httpContext,
        ApplicationDbContext db,
        IUserContext userContext,
        ILogger logger,
        CancellationToken cancellationToken)
    {
        string sessionId = request.SessionId!.Trim();
        string errorName = Truncate(Sanitize(string.IsNullOrWhiteSpace(request.Name) ? "Error" : request.Name.Trim()), ClientError.MaxErrorNameLength);
        string message = Truncate(Sanitize(request.Message!.Trim()), ClientError.MaxMessageLength);
        string? stack = NullIfBlank(request.Stack) is { } rawStack ? Truncate(Sanitize(rawStack), ClientError.MaxStackLength) : null;
        string? componentStack = NullIfBlank(request.ComponentStack) is { } rawComponentStack
            ? Truncate(Sanitize(rawComponentStack), ClientError.MaxComponentStackLength)
            : null;
        string path = Truncate(StripQuery(request.Path!.Trim()), ClientError.MaxPathLength);
        string fingerprint = ComputeFingerprint(errorName, message, stack);

        Guid? userId = Guid.TryParse(userContext.UserId, out Guid parsedUserId) ? parsedUserId : null;
        string? userAgent = RequestMetadataHelper.GetUserAgent(httpContext);

        List<string> sessionFingerprints = await db.ClientErrors
            .AsNoTracking()
            .Where(clientError => clientError.SessionId == sessionId)
            .Select(clientError => clientError.Fingerprint)
            .ToListAsync(cancellationToken);

        if (sessionFingerprints.Contains(fingerprint, StringComparer.Ordinal))
        {
            return new Response(false, "duplicate", fingerprint);
        }

        if (sessionFingerprints.Count >= MaxReportsPerSession)
        {
            return new Response(false, "session_limit", fingerprint);
        }

        bool isInternal = userContext.IsAdmin || request.InternalBrowser == true;
        if (!isInternal && userId.HasValue)
        {
            isInternal = await db.Users
                .AsNoTracking()
                .AnyAsync(user => user.Id == userId.Value && user.IsInternal, cancellationToken);
        }

        ClientError row = new()
        {
            Id = Guid.NewGuid(),
            Fingerprint = fingerprint,
            Source = request.Source!,
            ErrorName = errorName,
            Message = message,
            Stack = stack,
            ComponentStack = componentStack,
            Path = path.Length == 0 ? "/" : path,
            AppVersion = request.AppVersion,
            SessionId = sessionId,
            VisitorId = request.VisitorId,
            UserId = userId,
            IsAuthenticated = userContext.IsAuthenticated,
            UserAgent = userAgent,
            DeviceClass = UserAgentClassifier.DeviceClass(userAgent),
            IsBot = BotUserAgentDetector.IsBot(userAgent),
            IsInternal = isInternal,
            OccurredUtc = DateTime.UtcNow
        };

        db.ClientErrors.Add(row);
        // A report must not be lost because the page that sent it went away mid-request.
        await db.SaveChangesAsync(CancellationToken.None);

        logger.LogWarning(
            "Client error {ClientErrorFingerprint} ({ClientErrorName}) from {ClientErrorSource} on {ClientErrorPath} in app version {ClientAppVersion}: {ClientErrorMessage}",
            row.Fingerprint,
            row.ErrorName,
            row.Source,
            row.Path,
            row.AppVersion ?? "unknown",
            row.Message);

        return new Response(true, null, fingerprint);
    }

    /// <summary>
    /// Removes secrets and identifiers that must never be stored: URL query strings, fragments and
    /// userinfo, email addresses, JWTs, and bearer tokens.
    /// </summary>
    internal static string Sanitize(string value)
    {
        string result = UrlPattern().Replace(value, match =>
            match.Groups["scheme"].Value + match.Groups["rest"].Value + match.Groups["pos"].Value);
        result = JwtPattern().Replace(result, "[token]");
        result = BearerPattern().Replace(result, "Bearer [token]");
        result = EmailPattern().Replace(result, "[email]");
        return result;
    }

    /// <summary>
    /// Stable 32-hex-character id of an error: SHA-256 of the error name, the message with ids and
    /// numbers normalized, and the top stack frame without line/column or bundle hashes, so the same
    /// bug groups together across sessions and releases.
    /// </summary>
    internal static string ComputeFingerprint(string errorName, string message, string? stack)
    {
        string normalized = $"{errorName.Trim()}\n{NormalizeMessage(message)}\n{TopFrame(stack, errorName, message)}";
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexStringLower(hash)[..32];
    }

    internal static string NormalizeMessage(string message)
    {
        string result = GuidPattern().Replace(message, "<id>");
        result = HexPattern().Replace(result, "<hex>");
        result = DigitsPattern().Replace(result, "<n>");
        return WhitespacePattern().Replace(result, " ").Trim();
    }

    /// <summary>The first line of the stack that is a frame, normalized; empty when there is none.</summary>
    internal static string TopFrame(string? stack, string errorName, string message)
    {
        if (string.IsNullOrWhiteSpace(stack))
        {
            return string.Empty;
        }

        foreach (string rawLine in stack.Split('\n'))
        {
            string line = rawLine.Trim();
            if (line.Length == 0 ||
                line.StartsWith(errorName + ":", StringComparison.Ordinal) ||
                line == errorName ||
                line == message)
            {
                continue;
            }

            bool isFrame = line.StartsWith("at ", StringComparison.Ordinal) || line.Contains("://", StringComparison.Ordinal);
            if (!isFrame)
            {
                continue;
            }

            string frame = LineColumnPattern().Replace(line, string.Empty);
            frame = BundleHashPattern().Replace(frame, string.Empty);
            return WhitespacePattern().Replace(frame, " ");
        }

        return string.Empty;
    }

    private static string StripQuery(string path)
    {
        int cut = path.IndexOfAny(['?', '#']);
        return cut < 0 ? path : path[..cut];
    }

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
